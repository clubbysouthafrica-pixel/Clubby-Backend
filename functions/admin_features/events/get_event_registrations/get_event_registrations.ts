import {
    createResponse,
    deconstructEvent,
    queryItems,
} from "./function_helpers";

const EVENT_REGISTRATION_FIELDS_TO_REMOVE = new Set([
    "club_account_id",
    "registration_fields",
    "selected_pricing_option_ids"
]);

const sanitizeEventRegistration = (event_registration: Record<string, any>) => {
    return Object.fromEntries(
        Object.entries(event_registration).filter(([key]) => !EVENT_REGISTRATION_FIELDS_TO_REMOVE.has(key))
    );
};

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

        if (!events || events.length === 0) {
            return createResponse(200, { event_registrations: [], eventsFilters: [], chosen_event: null }, origin);
        }

        let chosen_event = null;
        if (!query_string_params.event_id) {
            chosen_event = events[0];
        } else {
            chosen_event = events.find((event: any) => event.event_id === query_string_params.event_id);

            if (!chosen_event) {
                return createResponse(404, { message: "Event not found." }, origin);
            }
        }

        const eventsFilters = [];
        for (const event of events ?? []) {
            eventsFilters.push({
                event_id: event.event_id,
                event_name: event.title,
            });
        }

        const event_registrations = await queryItems(
            process.env.EVENT_REGISTRATIONS_TABLE_NAME!,
            "event_id = :event_id",
            {
                ":event_id": chosen_event.event_id
            },
        );

        if (!event_registrations || event_registrations.length === 0) {
            return createResponse(200, { event_registrations: [], eventsFilters, chosen_event }, origin);
        }

        const sanitized_event_registrations = event_registrations.map((event_registration: Record<string, any>) =>
            sanitizeEventRegistration(event_registration)
        );

        return createResponse(200, { event_registrations: sanitized_event_registrations, eventsFilters, chosen_event }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};