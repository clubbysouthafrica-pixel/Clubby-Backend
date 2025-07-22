import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_type and club_account_id required." }, origin);
        }

        const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (item == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string, 
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );

        if (!club_member) {
            return createResponse(400, { message: "User is not a member of this club." }, origin);
        }

        return createResponse(200, {
            bank: item["bank"],
            account_number: item["account_number"],
            branch_code: item["branch_code"],
            account_type: item["account_type"],
            registration_payment_reference: club_member["registration_payment_reference"]
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
