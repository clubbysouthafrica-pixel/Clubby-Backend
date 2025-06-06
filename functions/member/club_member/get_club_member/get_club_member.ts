import { createResponse, deconstructEvent, getItemByKey } from "./function_helpers";

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    const { origin, body, query_string_params } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null || query_string_params?.user_id == null) {
            return createResponse(400, { message: "club_account_id and user_id required in query string params." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string' || typeof query_string_params.user_id !== 'string') {
            return createResponse(400, { message: "club_account_id and user_id must be STRING types." }, origin);
        }


        const item = await getItemByKey(
            process.env.CLUB_MEMBER_TABLE_NAME as string, 
            {
                club_account_id: query_string_params.club_account_id,
                user_id: query_string_params.user_id
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
