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

        let club_member: Record<string, any> | null = null;
        if (user_id) {
            club_member = await getItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            });
        }

        const member_exists = club_member ? true : false;
        const registered = club_member ? (club_member?.registered ? true : false) : false;

        return createResponse(200, {
            club_account_id: item["club_account_id"],
            club_type: item["club_type"],
            club_name: item["club_name"],
            description: item["description"] ?? undefined,
            club_member_exists: member_exists,
            registered: registered
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
