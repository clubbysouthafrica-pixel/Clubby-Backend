import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItemsWithPagination,
    extractTemplateVariables,
    queryItems
} from "./function_helpers";
import { RegistrationFieldFilter, applyFiltersToRegistration } from "./registration_field_filters";

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

        const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
        const previousToken = query_string_params?.pageToken ? JSON.parse(query_string_params.pageToken) : undefined;
        const memberType = query_string_params?.memberType;

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

        const members: any[] = []

        const activeKeys = query_string_params?.activeKeys ? query_string_params.activeKeys.split(',') : [];
        const parsedActiveKeys = activeKeys.map((key: any) => {
            const [type, fieldName] = key.split(':');
            return { type, fieldName };
        });

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
            )

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
                const registration = await getItem(
                    process.env.REGISTRATIONS_TABLE_NAME as string,
                    {
                        user_id: item.user_id,
                        registration_id: item.current_reg_id
                    }
                )

                if (body?.custom_filters && !registration) {
                    continue;
                }

                let registrationMatchesFilters = true;
                if (body?.custom_filters && registration) {
                    const filters: RegistrationFieldFilter[] = body.custom_filters;
                    const filterResult = applyFiltersToRegistration(registration, filters);
                    registrationMatchesFilters = filterResult.matches;
                }

                if (!registrationMatchesFilters) {
                    continue;
                }

                const meta_billing: any = [];
                const meta_standard: any = [];
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
                }


                members.push({
                    outstanding_amount: registration?.total_outstanding_amount,
                    registration_submitted_on: registration?.registration_submitted_on,
                    registered_on: registration?.registered_on,
                    user_id: item.user_id,
                    member_first_name: item.member_first_name,
                    member_surname: item.member_surname,
                    member_email: item.member_email,
                    meta_standard: meta_standard,
                    meta_billing: meta_billing,
                    registration_payment_reference: item?.registration_payment_reference,
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

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        const filters: any[] = []
        for (const field of form || []) {
            if (field?.visible !== true) continue
            if (field?.sensitive_information === true) continue

            if (field.field_type === "BILLING" && field.input_type === "DROPDOWN") {
                filters.push(
                    {
                        key: `billing:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        options: field.billingOptions.map((bo: any) => bo.label),
                        type: "billing"
                    }
                )
            } else if (field.field_type === "BILLING" && field.input_type === "DISCOUNT") {
                filters.push(
                    {
                        key: `billing:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        options: field.discountOptions.map((discount_option: any) => discount_option.label),
                        type: "billing"
                    }
                )
            } else if (field.field_type === "STANDARD" && field.input_type === "DROPDOWN") {
                filters.push(
                    {
                        key: `standard:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        options: field.options,
                        type: "standard"
                    }
                )
            } else if (field.field_type === "STANDARD" && field.input_type === "CHECKBOX") {
                filters.push(
                    {
                        key: `standard:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        options: ["true", "false"],
                        type: "standard"
                    }
                )
            } else if (field.field_type === "STANDARD" && field.input_type === "TEXT") {
                filters.push(
                    {
                        key: `standard:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        type: "standard"
                    }
                )
            } else if (field.field_type === "BILLING" && field.input_type === "NUMBER") {
                filters.push(
                    {
                        key: `billing:${field.field_name}`,
                        field_id: field.field_id,
                        field_name: field.field_name,
                        type: "billing:number"
                    }
                )
            }
        }

        const payment_methods = [
            "EFT/Cash",
            ...(club?.custom_payment_methods?.map((pm: { name: string, url: string }) => pm.name) || [])
        ]

        const template_variables = club?.registration_success_email_template_body
            ? extractTemplateVariables(club.registration_success_email_template_body)
            : [];

        if (club?.registration_success_email_template_body?.includes("{{member_name}}") && !template_variables.some(v => v.name === "member_name")) {
            template_variables.unshift({
                name: "member_name",
                title: "Member Name"
            });
        }
        if (club?.registration_success_email_template_body?.includes("{{club_name}}") && !template_variables.some(v => v.name === "club_name")) {
            template_variables.unshift({
                name: "club_name",
                title: "Club Name"
            });
        }
        if (club?.registration_success_email_template_body?.includes("{{club_email}}") && !template_variables.some(v => v.name === "club_email")) {
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

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
