import {
    createResponse,
    deconstructEvent,
    getItem
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!query_string_params.event_id || !query_string_params.event_registration_id) {
            return createResponse(400, { message: "Event ID and Event Registration ID query parameters are required" }, origin);
        }

        const event_registrations = await getItem(
            process.env.EVENT_REGISTRATIONS_TABLE_NAME!,
            {
                event_id: query_string_params.event_id,
                event_registration_id: query_string_params.event_registration_id
            },
        );

        if (!event_registrations) {
            return createResponse(404, { message: "Event registration not found." }, origin);
        }

        return createResponse(200, {
            registration_fields: event_registrations.registration_fields,
            selected_pricing_option_ids: event_registrations.selected_pricing_option_ids
        }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};