import {
    createResponse,
    deconstructEvent,
    getItem,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id required in query string." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const events = await queryItems(
            process.env.EVENTS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        if (!events || events.length === 0) {
            return createResponse(200, { message: "Events de-registration check passed." }, origin);
        }

        for (const event of events) {
            if (event.endDate < Date.now()) {
                return createResponse(211, { message: `Event, ${event.title}, has not ended yet. Please wait until the event ends before de-registering.`, event_id: event.event_id }, origin);
            }
            const event_registrations = await queryItems(
                process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
                "event_id = :eventId",
                { ":eventId": event.event_id },
            );

            for (const registration of event_registrations ?? []) {
                if (registration.amount_paid === 0 && registration.entry_fee_amount > 0) {
                    return createResponse(211, { message: "There are still pending event registrations with outstanding payments. Please resolve them before de-registering.", event_id: registration.event_id, status: "Awaiting payment" }, origin);
                }

                if (registration.amount_paid > 0 && registration.entry_fee_amount > 0 && registration.amount_paid < registration.entry_fee_amount) {
                    return createResponse(211, { message: "There are still pending event registrations with outstanding payments. Please resolve them before de-registering.", event_id: registration.event_id, status: "Partially paid" }, origin);
                }

                if (!registration?.confirmed_status) {
                    return createResponse(211, { message: "There are still pending event registrations that are not confirmed. Please resolve them before de-registering.", event_id: registration.event_id }, origin);
                }
            }
        }

        return createResponse(200, { message: "Events de-registration check passed." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
