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

        const response = await queryItems(
            process.env.EVENT_REGISTRATIONS_TABLE_NAME!,
            "user_id = :user_id",
            {
                ":user_id": user_id as string
            },
            process.env.EVENT_REGISTRATIONS_USER_ID_INDEX!
        );

        const event_registrations = response?.filter(registration => registration.club_account_id === query_string_params.club_account_id)

        if (!event_registrations || event_registrations.length === 0) {
            return createResponse(200, { events: [] }, origin);
        }

        return createResponse(200, { event_registrations }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};