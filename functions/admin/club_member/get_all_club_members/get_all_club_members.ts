import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        )

        if (club_members == null) {
            return createResponse(200, { registered: [], not_registered: [] }, origin);
        }

        const registered: any[] = []
        const unregistered: any[] = []

        club_members.forEach(async item => {
            delete item.club_account_id

            const registration_fee = await getItem(
                process.env.REGISTRATION_FEES_TABLE_NAME as string,
                { 
                   user_id: user_id as string,
                   registration_id: item.current_reg_id
                }
            )

            const meta_billing: any = [];
            const meta_standard: any = [];
            Object.keys(item).forEach(key => {
                if (key.includes("reg_field_") && item[key].type.includes("STANDARD_")) {
                    meta_standard.push(item[key])
                }
            })
            Object.keys(registration_fee ?? {}).forEach(key => {
                if (key.includes("reg_field_") && item[key].type.includes("BILLING_")) {
                    meta_billing.push(item[key])
                }
            })

            if (item.registered) {
                registered.push({
                    outstanding_amount: registration_fee?.total_outstanding_amount,
                    user_id: item.user_id,
                    member_first_name: item.member_first_name,
                    member_surname: item.member_surname,
                    registration_submitted_on: item.registration_submitted_on ?? undefined,
                    registered_on: item.registered_on ?? undefined,
                    member_email: item.member_email,
                    meta_standard: meta_standard,
                    meta_billing: meta_billing
                });
            } else {
                unregistered.push({
                    outstanding_amount: item.outstanding_amount,
                    registration_payment_reference: item.registration_payment_reference,
                    member_first_name: item.member_first_name,
                    member_surname: item.member_surname,
                    user_id: item.user_id,
                    registration_submitted_on: item.registration_submitted_on ?? undefined,
                    meta_standard: meta_standard,
                    meta_billing: meta_billing
                });
            }
        })

        return createResponse(200, { registered, unregistered }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
