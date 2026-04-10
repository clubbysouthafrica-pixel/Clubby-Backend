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

function toUtcDayStartMs(value: unknown): number | null {
    const epochMs = toEpochMs(value);

    if (!epochMs) {
        return null;
    }

    const date = new Date(epochMs);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
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
        const now = new Date();
        now.setUTCHours(0, 0, 0, 0);
        const today = now.getTime();

        for (const event of events) {
            const registrationOpenDate = toUtcDayStartMs(event?.registrationOpenDate);
            const registrationCloseDate = toUtcDayStartMs(event?.registrationCloseDate);

            if (
                registrationOpenDate !== null
                && registrationCloseDate !== null
                && today >= registrationOpenDate
                && today <= registrationCloseDate
            ) {
                eventResponse.push(event);
            }
        }

        return createResponse(200, { events: eventResponse ?? [] }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};