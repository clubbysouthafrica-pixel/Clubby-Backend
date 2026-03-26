import {
    createResponse,
    deconstructEvent,
    queryItems,
} from "./function_helpers";

function toEpochMs(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value < 1_000_000_000_000 ? value * 1000 : value;
}

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

        if (!events) {
            return createResponse(200, { events: [] }, origin);
        }

        const eventResponse: any[] = []
        const now = Date.now();
        for (const event of events) {
            const registrationOpenDate = toEpochMs(event?.registrationOpenDate);

            if (registrationOpenDate && registrationOpenDate > now) {
                eventResponse.push({
                    event_id: event.event_id,
                    description: event.description,
                    endDate: event.endDate,
                    registrationCloseDate: event.registrationCloseDate,
                    registrationOpenDate: event.registrationOpenDate,
                    startDate: event.startDate,
                    title: event.title
                });
            } else {
                eventResponse.push(event);
            }
        }

        return createResponse(200, { events: eventResponse ?? [] }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};