import {
    createResponse,
    deconstructEvent,
    decryptData,
    getItem,
    queryItemsWithPagination,
    extractTemplateVariables,
    queryItems
} from "./function_helpers";
import { RegistrationFieldFilter, applyFiltersToRegistration } from "./registration_field_filters";

const USER_ENCRYPTED_FIELDS = new Set([
    "address_line_1",
    "address_line_2",
    "phone_number",
    "date_of_birth"
]);

const MEMBER_PROFILE_FIELDS = new Set([
    "address_line_1",
    "address_line_2",
    "date_of_birth",
    "phone_number",
    "suburb",
    "postal_code",
    "city",
    "country"
]);

const normalizeDateValue = (value: string) => {
    return value.trim().replace(/[-.]/g, "/").replace(/\/+$/g, "");
};

const applyMemberProfileFilters = (
    userData: Record<string, any>,
    filters: RegistrationFieldFilter[]
) => {
    for (const filter of filters) {
        if (!MEMBER_PROFILE_FIELDS.has(filter.field_id)) {
            return false;
        }

        const fieldValue = userData?.[filter.field_id];
        if (fieldValue == null || fieldValue === "") {
            return false;
        }

        if (filter.input_type === "date") {
            const normalizedFieldValue = normalizeDateValue(String(fieldValue));
            const normalizedFilterValue = normalizeDateValue(String(filter.value));
            if (normalizedFieldValue !== normalizedFilterValue) {
                return false;
            }
            continue;
        }

        const normalizedFieldValue = String(fieldValue).toLowerCase();
        const normalizedFilterValue = String(filter.value).toLowerCase();
        if (!normalizedFieldValue.includes(normalizedFilterValue)) {
            return false;
        }
    }

    return true;
};

const getUserActiveKeyData = async (userId: string, activeKeys: string[]) => {
    if (activeKeys.length === 0) {
        return {};
    }

    const user = await getItem(
        process.env.USERS_TABLE_NAME as string,
        {
            user_type: "MEMBER",
            user_id: userId
        }
    );

    if (!user) {
        return {};
    }

    const userData: Record<string, any> = {};
    for (const activeKey of activeKeys) {
        if (!(activeKey in user)) {
            userData[activeKey] = undefined;
            continue;
        }

        userData[activeKey] = USER_ENCRYPTED_FIELDS.has(activeKey)
            ? await decryptData(user[activeKey])
            : user[activeKey];
    }

    return userData;
};

const getMembersPageData = async (
    query_string_params: any,
    body: any,
    origin: string
): Promise<any> => {
    const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
    const previousToken = query_string_params?.pageToken ? JSON.parse(query_string_params.pageToken) : undefined;
    const memberType = query_string_params?.memberType;
    const activeKeys = query_string_params?.activeKeys
        ? query_string_params.activeKeys.split(",").map((key: string) => key.trim()).filter(Boolean)
        : [];
    const customFilters: RegistrationFieldFilter[] = body?.custom_filters ?? [];
    const memberProfileFilters = customFilters.filter(filter => filter.type === "member_profile");
    const registrationFilters = customFilters.filter(filter => filter.type !== "member_profile");
    const requestedUserKeys = Array.from(new Set([
        ...activeKeys,
        ...memberProfileFilters.map(filter => filter.field_id)
    ]));

    let filterExpression: string | undefined;
    let expressionAttributeNames: Record<string, string> | undefined;
    const expressionAttributeValues: Record<string, any> = { ":clubId": query_string_params.club_account_id };

    let queryLimit = limit;

    if (memberType === "registered") {
        filterExpression = "#registered = :true";
        expressionAttributeValues[":true"] = true;
        expressionAttributeNames = { "#registered": "registered" };
    } else if (memberType === "pending") {
        filterExpression = "#registered = :false AND #resubmission = :false";
        expressionAttributeValues[":false"] = false;
        expressionAttributeNames = { "#registered": "registered", "#resubmission": "resubmission_required" };
    } else if (memberType === "previous") {
        filterExpression = "#registered = :false AND #resubmission = :true";
        expressionAttributeValues[":false"] = false;
        expressionAttributeValues[":true"] = true;
        expressionAttributeNames = { "#registered": "registered", "#resubmission": "resubmission_required" };
    }

    const members: any[] = [];
    const userDataCache = new Map<string, Record<string, any>>();
    let currentToken = previousToken;
    let lastEvaluatedKey: any = undefined;

    while (true) {
        const queryResult = await queryItemsWithPagination(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            expressionAttributeValues,
            process.env.CLUB_ACCOUNT_ID_INDEX as string,
            true,
            (queryLimit ?? 0) - members.length,
            currentToken,
            filterExpression,
            expressionAttributeNames
        );

        const club_members = queryResult.items;
        const queryLastEvaluatedKey = queryResult.lastEvaluatedKey;

        let filteredItems = club_members ?? [];
        if (body?.member_filters) {
            filteredItems = filteredItems.filter((item: any) => {
                let matches = true;

                if (body.member_filters.member_name) {
                    const fullName = `${item.member_first_name} ${item.member_surname}`.toLowerCase();
                    if (!fullName.includes(body.member_filters.member_name.toLowerCase())) {
                        matches = false;
                    }
                }

                if (body.member_filters.member_id && matches) {
                    if (item.user_id !== body.member_filters.member_id) {
                        matches = false;
                    }
                }

                return matches;
            });
        }

        for (const item of filteredItems) {
            let activeUserData = userDataCache.get(item.user_id);
            if (!activeUserData) {
                activeUserData = await getUserActiveKeyData(item.user_id, requestedUserKeys);
                userDataCache.set(item.user_id, activeUserData);
            }

            if (memberProfileFilters.length > 0 && !applyMemberProfileFilters(activeUserData, memberProfileFilters)) {
                continue;
            }

            const allRegistrations = await queryItems(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                "user_id = :userId",
                { ":userId": item.user_id }
            );

            if (!allRegistrations || allRegistrations.length === 0) {
                members.push({
                    user_id: item.user_id,
                    member_first_name: item.member_first_name,
                    member_surname: item.member_surname,
                    member_email: item.member_email,
                    registered: item.registered,
                    resubmission_required: item.resubmission_required,
                    ...activeUserData,
                    registrations: []
                });
                continue;
            }

            for (const registration of allRegistrations || []) {
                if (registrationFilters.length > 0 && !registration) {
                    continue;
                }

                if (registration.club_account_id !== query_string_params.club_account_id) {
                    continue;
                }

                let registrationMatchesFilters = true;
                if (registrationFilters.length > 0 && registration) {
                    const filterResult = applyFiltersToRegistration(registration, registrationFilters);
                    registrationMatchesFilters = filterResult.matches;
                }

                if (!registrationMatchesFilters) {
                    continue;
                }

                const userIndex = members.findIndex(m => m.user_id === item.user_id);
                if (userIndex !== -1) {
                    members[userIndex].registrations.push({
                        registration_id: registration.registration_id,
                        latest_registration: registration.latest_registration,
                        deregistered: registration.deregistered,
                        registration_submitted_on: registration.registration_submitted_on,
                        registered_on: registration.registered_on,
                        deregistered_on: registration.deregistered_on
                    });
                } else {
                    members.push({
                        user_id: item.user_id,
                        member_first_name: item.member_first_name,
                        member_surname: item.member_surname,
                        member_email: item.member_email,
                        registered: item.registered,
                        resubmission_required: item.resubmission_required,
                        ...activeUserData,
                        registrations: [{
                            registration_id: registration.registration_id,
                            latest_registration: registration.latest_registration,
                            deregistered: registration.deregistered,
                            registration_submitted_on: registration.registration_submitted_on,
                            registered_on: registration.registered_on,
                            deregistered_on: registration.deregistered_on
                        }]
                    });
                }
            }
        }

        if (limit && members.length >= limit) {
            const totalItems = members.length;
            if (totalItems > limit) {
                const excess = totalItems - limit;
                if (excess > 0) {
                    members.splice(members.length - excess, excess);
                }
            }
            const lastItem = filteredItems[filteredItems.length - 1];
            lastEvaluatedKey = {
                user_id: { "S": lastItem.user_id },
                club_account_id: { "S": lastItem.club_account_id }
            };
            break;
        }

        if (!queryLastEvaluatedKey) {
            lastEvaluatedKey = undefined;
            break;
        }

        currentToken = queryLastEvaluatedKey;
    }

    return createResponse(200, {
        members,
        pageToken: lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : undefined
    }, origin);
};

const getRegistrationPageData = async (
    query_string_params: any,
    body: any,
    club: any,
    origin: string
): Promise<any> => {
    const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
    const previousToken = query_string_params?.pageToken ? JSON.parse(query_string_params.pageToken) : undefined;
    const memberType = query_string_params?.memberType;
    const activeKeys = query_string_params?.activeKeys ? query_string_params.activeKeys.split(',') : [];
    const parsedActiveKeys = activeKeys.map((key: any) => {
        const [type, ...fieldNameParts] = key.split(':');
        return { type, fieldName: fieldNameParts.join(':') };
    });

    let queryLimit = limit;

    const members: any[] = [];
    let currentToken = previousToken;
    let lastEvaluatedKey: any = undefined;
    let items = [];

    while (true) {
        const queryResult = await queryItemsWithPagination(
            process.env.REGISTRATIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string,
            true,
            (queryLimit ?? 0) - members.length,
            currentToken,
        );
        const registrations = queryResult.items;
        const queryLastEvaluatedKey = queryResult.lastEvaluatedKey;

        for (const registration of registrations || []) {
            items.push(registration);

            if (body?.custom_filters && !registration) {
                continue;
            }
            if (query_string_params?.show_archived !== "true" && registration?.archived) {
                continue;
            }


            let registrationMatchesFilters = true;
            if (body?.custom_filters && registration) {
                const filters: RegistrationFieldFilter[] = body.custom_filters;
                const filterResult = applyFiltersToRegistration(registration, filters);
                if (!filterResult.matches) {
                    registrationMatchesFilters = false;
                    continue;
                }
            }

            const club_member = await getItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    user_id: registration.user_id,
                    club_account_id: query_string_params.club_account_id
                }
            );

            if (memberType === "registered" && (registration.registration_id !== club_member?.current_reg_id || registration?.deregistered || club_member?.registered !== true)) {
                continue;
            } else if (memberType === "pending" && (registration.registration_id !== club_member?.current_reg_id || registration?.deregistered || club_member?.registered === true)) {
                continue;
            } else if (memberType === "previous" && registration.deregistered === false) {
                continue;
            }

            if (body?.member_filters) {
                if (body.member_filters.member_name) {
                    const fullName = `${club_member?.member_first_name} ${club_member?.member_surname}`.toLowerCase();
                    if (!fullName.includes(body.member_filters.member_name.toLowerCase())) {
                        continue;
                    }
                }

                if (body.member_filters.member_id) {
                    if (registration.user_id !== body.member_filters.member_id) {
                        continue;
                    }
                }
            }

            const meta_billing: any = [];
            const meta_standard: any = [];
            const meta_club_variables: any = [];
            if (registration && activeKeys.length > 0) {
                for (const key of Object.keys(registration)) {
                    const field = registration[key];

                    if (key.includes("reg_field_") && field.type.includes("BILLING_")) {
                        const matchingKey = parsedActiveKeys.find((ak: any) => ak.type === "billing" && ak.fieldName === field.field_name);
                        if (matchingKey) {
                            meta_billing.push(field);
                        }
                    } else if (key.includes("reg_field_") && field.type.includes("STANDARD_")) {
                        if (!field?.signature_type) {
                            const matchingKey = parsedActiveKeys.find((ak: any) => ak.type === "standard" && ak.fieldName === field.field_name);
                            if (matchingKey) {
                                meta_standard.push(field);
                            }
                        }
                    }
                }

                for (const activeKey of parsedActiveKeys) {
                    if (activeKey.type !== "club_variable") {
                        continue;
                    }

                    const templateVariable = registration?.template_variables?.find(
                        (variable: any) => variable?.name === activeKey.fieldName
                    );

                    if (templateVariable) {
                        meta_club_variables.push({
                            name: templateVariable.name,
                            value: templateVariable.value
                        });
                    }
                }
            }

            const user_information: Record<string, any> = {}
            if (!club_member) {
                const user = await getItem(
                    process.env.USERS_TABLE_NAME as string,
                    {
                        user_type: "MEMBER",
                        user_id: registration.user_id
                    }
                );

                user_information["user_id"] = registration.user_id;
                user_information["member_first_name"] = user?.first_name;
                user_information["member_surname"] = user?.surname;
                user_information["member_email"] = "n/a";
                user_information["registration_payment_reference"] = "n/a";
                user_information["missing_club_member"] = true;

            } else {
                user_information["user_id"] = club_member?.user_id;
                user_information["member_first_name"] = club_member?.member_first_name;
                user_information["member_surname"] = club_member?.member_surname;
                user_information["member_email"] = club_member?.member_email;
                user_information["registration_payment_reference"] = club_member?.registration_payment_reference ?? "n/a";
            }

            members.push({
                outstanding_amount: registration?.total_outstanding_amount,
                registration_id: registration?.registration_id,
                registration_submitted_on: registration?.registration_submitted_on,
                deregistered_on: registration?.deregistered_on,
                total_fee: registration?.total_fee,
                archived: registration?.archived ?? undefined,
                registered_on: registration?.registered_on,
                meta_standard: meta_standard,
                meta_billing: meta_billing,
                meta_club_variables: meta_club_variables,
                last_season_registration: registration?.last_season_registration ?? undefined,
                ...user_information
            });
        }

        if (limit && members.length >= limit) {
            const totalItems = members.length;
            if (totalItems > limit) {
                const excess = totalItems - limit;
                if (excess > 0) {
                    members.splice(members.length - excess, excess);
                }
            }
            const lastItem = items[items.length - 1];
            lastEvaluatedKey = {
                club_account_id: { "S": lastItem.club_account_id },
                user_id: { "S": lastItem.user_id },
                registration_id: { "S": lastItem.registration_id }
            };
            break;
        }

        if (!queryLastEvaluatedKey) {
            lastEvaluatedKey = undefined;
            break;
        }

        currentToken = queryLastEvaluatedKey;
    }

    const form = await queryItems(
        process.env.REGISTRATION_FORM_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": query_string_params.club_account_id }
    );

    const filters: any[] = [];
    for (const field of form || []) {
        if (field?.sensitive_information === true) continue;

        if (field.field_type === "BILLING" && field.input_type === "DROPDOWN") {
            filters.push(
                {
                    key: `billing:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    options: field.billingOptions.map((bo: any) => bo.label),
                    type: "billing"
                }
            );
        } else if (field.field_type === "BILLING" && field.input_type === "DISCOUNT") {
            filters.push(
                {
                    key: `billing:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    options: field.discountOptions.map((discount_option: any) => discount_option.label),
                    type: "billing"
                }
            );
        } else if (field.field_type === "STANDARD" && field.input_type === "DROPDOWN") {
            filters.push(
                {
                    key: `standard:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    options: field.options,
                    type: "standard"
                }
            );
        } else if (field.field_type === "STANDARD" && field.input_type === "CHECKBOX") {
            filters.push(
                {
                    key: `standard:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    options: ["true", "false"],
                    type: "standard"
                }
            );
        } else if (field.field_type === "STANDARD" && field.input_type === "TEXT") {
            filters.push(
                {
                    key: `standard:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    type: "standard"
                }
            );
        } else if (field.field_type === "BILLING" && field.input_type === "NUMBER") {
            filters.push(
                {
                    key: `billing:${field.field_name}`,
                    field_id: field.field_id,
                    field_name: field.field_name,
                    type: "billing:number"
                }
            );
        }
    }

    for (const variable of club?.club_variables || []) {
        filters.push(
            {
                key: `club_variable:${variable.key}`,
                field_id: variable.key,
                field_name: variable.name,
                input_type: "text",
                type: "club_variable"
            }
        );
    }

    const payment_methods = [
        "EFT/Cash",
        ...(club?.custom_payment_methods?.map((pm: { name: string, url: string }) => pm.name) || [])
    ];
    
    const template_variables = (club?.club_variables || []).map((variable: any) => ({ title: variable.name, name: variable.key, rules_engine: variable?.rules_engine ? true : false })) || [];

    if (club?.registration_success_email_template_body?.includes("{{member_name}}") && !template_variables.some((v: any) => v.name === "member_name")) {
        template_variables.unshift({
            name: "member_name",
            title: "Member Name"
        });
    }
    if (club?.registration_success_email_template_body?.includes("{{club_name}}") && !template_variables.some((v: any) => v.name === "club_name")) {
        template_variables.unshift({
            name: "club_name",
            title: "Club Name"
        });
    }
    if (club?.registration_success_email_template_body?.includes("{{club_email}}") && !template_variables.some((v: any) => v.name === "club_email")) {
        template_variables.unshift({
            name: "club_email",
            title: "Club Email"
        });
    }

    return createResponse(200, {
        members,
        filters,
        payment_methods,
        template_variables,
        pageToken: lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : undefined
    }, origin);
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (query_string_params?.page === "members") {
            return getMembersPageData(query_string_params, body, origin);
        }

        return getRegistrationPageData(query_string_params, body, club, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
