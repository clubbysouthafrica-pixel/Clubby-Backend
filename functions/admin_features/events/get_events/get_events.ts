import {
    createResponse,
    deconstructEvent,
    queryItems,
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!query_string_params.club_account_id) {
            return createResponse(400, { message: "Club Account ID query parameter is required" }, origin);
        }
        const events = await queryItems(
            process.env.EVENTS_TABLE_NAME as string,
            "club_account_id = :club_account_id",
            {
                ":club_account_id": query_string_params.club_account_id
            }
        );

        return createResponse(200, { events: events ?? [] }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};