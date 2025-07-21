import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

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

        club_members.forEach(item => {
            delete item.club_account_id

            const meta = { ...item };
            delete meta.billing_type;
            delete meta.club_name;
            delete meta.outstanding_amount;
            delete meta.primary_member;
            delete meta.registration_submitted_on;
            delete meta.user_id;
            delete meta.registered_on;
            delete meta.member_first_name;
            delete meta.member_surname;
            delete meta.registered
            delete meta.member_email

            if (item.registered) {
                registered.push({
                    billing_type: item.billing_type,
                    outstanding_amount: item.outstanding_amount,
                    primary_member: item.primary_member,
                    user_id: item.user_id,
                    member_first_name: item.member_first_name,
                    payment_reference: item.payment_reference,
                    member_surname: item.member_surname,
                    registration_submitted_on: item.registration_submitted_on ?? undefined,
                    registered_on: item.registered_on ?? undefined,
                    member_email: item.member_email,
                    meta: meta
                });
            } else {
                unregistered.push({
                    billing_type: item.billing_type,
                    outstanding_amount: item.outstanding_amount,
                    primary_member: item.primary_member,
                    member_first_name: item.member_first_name,
                    member_surname: item.member_surname,
                    user_id: item.user_id,
                    registration_submitted_on: item.registration_submitted_on ?? undefined,
                    meta: meta,
                });
            }
        })

        return createResponse(200, { registered, unregistered }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
