import { createResponse, deconstructEvent, getItem, queryItems, extractTemplateVariables } from "./function_helpers";

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

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        )

        if (club_members == null) {
            return createResponse(200, { registered: [], unregistered: [] }, origin);
        }

        const registered: any[] = []
        const unregistered: any[] = []

        // Parse activeKeys query parameter
        const activeKeys = query_string_params?.activeKeys ? query_string_params.activeKeys.split(',') : [];
        const parsedActiveKeys = activeKeys.map((key: any) => {
            const [type, fieldName] = key.split(':');
            return { type, fieldName };
        });

        // Get memberType filter
        const memberType = query_string_params?.memberType;

        for (const item of club_members) {
            delete item.club_account_id

            const registration = await getItem(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                {
                    user_id: item.user_id,
                    registration_id: item.current_reg_id
                }
            )

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

            if (item.registered) {
                if (!memberType || memberType === "registered") {
                    registered.push({
                        outstanding_amount: registration?.total_outstanding_amount,
                        registration_submitted_on: registration?.registration_submitted_on,
                        registered_on: registration?.registered_on,
                        user_id: item.user_id,
                        member_first_name: item.member_first_name,
                        member_surname: item.member_surname,
                        member_email: item.member_email,
                        meta_standard: meta_standard,
                        meta_billing: meta_billing
                    });
                }
            } else {
                let shouldInclude = false;
                
                if (!memberType) {
                    shouldInclude = true;
                } else if (memberType === "previous" && item.resubmission_required === true) {
                    shouldInclude = true;
                } else if (memberType === "pending" && item.resubmission_required !== true) {
                    shouldInclude = true;
                }

                if (shouldInclude) {
                    unregistered.push({
                        outstanding_amount: registration?.total_outstanding_amount,
                        registration_submitted_on: registration?.registration_submitted_on,
                        deregistered_on: registration?.deregistered_on,
                        registration_payment_reference: item.registration_payment_reference,
                        member_first_name: item.member_first_name,
                        member_surname: item.member_surname,
                        member_email: item.member_email,
                        user_id: item.user_id,
                        resubmission_required: item.resubmission_required,
                        meta_standard: meta_standard,
                        meta_billing: meta_billing,
                    });
                }
            }
        }

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        const filters: any[] = []
        for (const field of form || []) {
            if (field?.visible !== true) continue
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
            ...club?.custom_payment_methods.map((pm: { name: string, url: string }) => pm.name)
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

        return createResponse(200, {
            registered, unregistered,
            filters,
            payment_methods,
            template_variables,
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
