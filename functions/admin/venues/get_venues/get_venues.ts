import {
    createResponse,
    deconstructEvent,
    queryItems,
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!query_string_params.club_account_id) {
            return createResponse(400, { message: "Missing club_account_id in query parameters." }, origin);
        }

        const venues = await queryItems(
            process.env.VENUES_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        return createResponse(200, { venues: venues ?? [] }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};