import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems,
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!query_string_params.club_account_id) {
            return createResponse(400, { message: "Missing club_account_id in query parameters." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: query_string_params.club_account_id }
        );

        if (!club) {
            return createResponse(404, { message: "Club not found" }, origin);
        }

        const venues = await queryItems(
            process.env.VENUES_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        return createResponse(200, { venues: venues ?? [], venues_enabled: club?.venues_enabled ?? false }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};