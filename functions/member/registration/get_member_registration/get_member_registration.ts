import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent, getItem, queryItems, formatAmount, getSignatureUrl, decryptData, extractTemplateVariables } from "./function_helpers";

async function getClubMemberRegistrationId(user_id: string, club_account_id: string): Promise<string> {
    const club_member = await getItem(
        process.env.CLUB_MEMBER_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            user_id: user_id as string
        }
    );

    return club_member?.current_reg_id
}

async function getRegistration(user_id: string, registration_id: string): Promise<any | null> {
    return await getItem(
        process.env.REGISTRATIONS_TABLE_NAME as string,
        {
            user_id: user_id,
            registration_id: registration_id,
        }
    )
}

async function getClub(club_account_id: string): Promise<any> {
    return await getItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id: club_account_id
        }
    )
}

async function getRegistrationForm(club_account_id: string): Promise<Record<string, any>[]> {
    const form = await queryItems(
        process.env.REGISTRATION_FORM_TABLE_NAME as string,
        "club_account_id = :clubId",
        { ":clubId": club_account_id },
        undefined,
        false,
    )

    const pages: Record<string, any>[] = [];
    form?.forEach((item) => {
        const set = unmarshall(item);

        delete set.club_account_id;

        if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
            set["options"] = item.options.L.map((opt: { S: string }) => opt.S);
        }

        let page = pages.find(p => p.page_index === set.page_index);

        if (!page) {
            page = {
                page_index: set.page_index,
                page_header: set.page_header,
                fields: []
            };
            pages.push(page);
        }

        page.fields.push({
            ...set,
            page_index: undefined,
            page_header: undefined
        });
    });

    return pages
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null || query_string_params?.currency == null) {
            return createResponse(400, { message: "club_account_id required in query string params." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string' || typeof query_string_params.currency !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const registration_id = await getClubMemberRegistrationId(user_id as string, query_string_params.club_account_id);
        const member_registration = await getRegistration(user_id as string, registration_id);

        if (member_registration == null) {
            return createResponse(400, { message: "Member registration not found." }, origin);
        }

        const registration_form = await getRegistrationForm(query_string_params.club_account_id)

        const pages: Record<string, any>[] = [];
        for (const page of registration_form) {
            const new_page = {
                page_index: page.page_index,
                page_header: page.page_header,
                fields: []
            } as { page_index: number, page_header: string, fields: Record<string, any>[] };

            for (const field of page.fields) {
                if (field.field_type === "TEXT" && field.visible) {
                    new_page.fields.push({ label: field.field_text, position: field.field_order_id, type: "TEXT", });
                    continue;
                }

                let found = false;

                for (const key of Object.keys(member_registration)) {
                    const reg = member_registration[key];

                    if (key.includes(field.field_id) && reg.type === "STANDARD_SIGNATURE") {
                        if (reg.signature_type === "signature") {
                            if (member_registration?.last_season_registration === true) {
                                new_page.fields.push({
                                    type: "STANDARD_SIGNATURE",
                                    signature_type: "name",
                                    label: field.field_name,
                                    value: "Previous Season Registration - Signature Not Available",
                                    position: field.field_order_id,
                                    visible: field?.visible ?? true
                                });
                            } else {
                                new_page.fields.push({
                                    type: "STANDARD_SIGNATURE",
                                    signature_type: "signature",
                                    label: field.field_name,
                                    value: await getSignatureUrl(reg.value),
                                    position: field.field_order_id,
                                    visible: field?.visible ?? true
                                });
                            }
                        } else {
                            new_page.fields.push({
                                type: "STANDARD_SIGNATURE",
                                signature_type: "name",
                                label: field.field_name,
                                value: reg.value,
                                position: field.field_order_id,
                                visible: field?.visible ?? true
                            });
                        }
                        found = true;
                        break;
                    }

                    else if (key.includes(field.field_id) && reg.type.includes("STANDARD_")) {

                        let value = reg.value
                        if (reg.type === "STANDARD_CHECKBOX" && reg?.value !== "true") value = "false";
                        new_page.fields.push({
                            field_id: field.field_id,
                            type: "STANDARD_OTHER",
                            label: field.field_name,
                            value: field?.sensitive_information === true ? await decryptData(value) : value,
                            position: field.field_order_id,
                            editable_by_member: field?.editable_by_member ?? false,
                            visible: field?.visible ?? true
                        });
                        found = true;
                        break;
                    }

                    else if (key.includes(field.field_id) && reg.type === "BILLING_DISCOUNT") {
                        new_page.fields.push({
                            type: "BILLING",
                            label: field.field_name,
                            value: `${reg.label_value} - ${reg.value}% off`,
                            position: field.field_order_id,
                            visible: field?.visible ?? true
                        });
                        found = true;
                        break;
                    }

                    else if (key.includes(field.field_id) && reg.type.includes("BILLING_")) {
                        new_page.fields.push({
                            type: "BILLING",
                            label: field.field_name,
                            value: reg.label_value ? `${reg.label_value} - ${reg.value === 0 ? "FREE" : formatAmount(reg.value, query_string_params.currency)}` : formatAmount(reg.value, query_string_params.currency),
                            quantity: reg.multiplier_value > 1 ? reg.multiplier_value : undefined,
                            position: field.field_order_id,
                            discount: reg?.discount ?? undefined,
                            visible: field?.visible ?? true
                        });
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    if (field.field_type === "STANDARD" && field.input_type !== "SIGNATURE") {
                        new_page.fields.push({
                            field_id: field.field_id,
                            type: "STANDARD_OTHER",
                            label: field.field_name,
                            position: field.field_order_id,
                            visible: field?.visible ?? true
                        });
                    } else {
                        new_page.fields.push({
                            type: "DNE",
                            label: field.field_name,
                            position: field.field_order_id,
                            editable_by_member: field?.editable_by_member ?? false,
                            visible: field?.visible ?? true
                        });
                    }
                }
            }

            new_page.fields.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            pages.push(new_page);
        }

        const admin_notes = (member_registration?.admin_notes || []).filter((note: any) => note.visibleToMember);

        const club = await getClub(query_string_params.club_account_id);
        const template_variables = club?.club_variables?.map((variable: any) => ({ title: variable.name, name: variable.key }));

        let variables = [] as Array<{ name: string; title: string; value?: string }>;
        if (template_variables) {
            variables = template_variables;
            variables = template_variables.filter((v: any) => v.name !== "member_name");
            variables = template_variables.filter((v: any) => v.name !== "club_name");
            variables = template_variables.filter((v: any) => v.name !== "club_email");

            const registration_variables = member_registration?.template_variables ?? [];
            for (const variable of variables) {
                for (const reg_variable of registration_variables) {
                    if (variable.name === reg_variable.name) {
                        variable["value"] = reg_variable.value;
                        break;
                    }
                }
            }
        }

        pages.sort((a, b) => (a.page_index ?? 0) - (b.page_index ?? 0));
        return createResponse(200, {
            pages,
            deregistration_reason: member_registration?.deregistration_reason,
            registration_id: registration_id,
            admin_notes: admin_notes ?? [],
            variables: variables
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
