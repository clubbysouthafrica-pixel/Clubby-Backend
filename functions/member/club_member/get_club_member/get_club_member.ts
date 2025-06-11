import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required in query string params." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }


        const item = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string, 
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );

        if (item == null) {
            return createResponse(400, { message: "User not found." }, origin);
        }

        delete item.user_id
        delete item.club_account_id

        return createResponse(200, { ...item }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
