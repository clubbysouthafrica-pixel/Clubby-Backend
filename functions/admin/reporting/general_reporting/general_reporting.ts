import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        );

        if (!club_members) {
            return createResponse(500, { message: "Club does not exist." }, origin);
        }

        let total_registered_members = 0;
        let total_pending_members = 0;
        let total_registration_fees_due_by_pending_members = 0;
        let total_registration_fees = 0;

        club_members?.forEach(member => {
            if (member.registered) {
                total_registered_members += 1
                total_registration_fees += member.registration_amount
            } else {
                total_pending_members += 1
                total_registration_fees_due_by_pending_members += member.outstanding_amount
            }
        });

        return createResponse(200, {
            total_registered_members,
            total_pending_members,
            total_registration_fees_due_by_pending_members,
            total_registration_fees
        }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
