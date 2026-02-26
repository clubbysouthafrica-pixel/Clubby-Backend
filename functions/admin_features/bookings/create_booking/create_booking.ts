import {
    createResponse,
    deconstructEvent,
    addItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

const validateVenueInput = (body: any) => {

    if (!body.venue_id || typeof body.venue_id !== "string" || body.venue_id.trim() === "") {
        return "Venue ID is required and must be a non-empty string";
    }

    if (!body.smallest_booking_unit || typeof body.smallest_booking_unit !== "number" || body.smallest_booking_unit <= 0) {
        return "Smallest Booking Unit is required and must be a positive number (in minutes)"
    }

    if (!body.start_time || typeof body.start_time !== "number") {
        return "Start Time is required and must be in epoch format";
    }

    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
        return "Name is required and must be a non-empty string";
    }

    if (!body.duration || typeof body.duration !== "number" || body.duration <= 0) {
        return "Duration is required and must be a positive number (in minutes)";
    }

    if (body.duration % body.smallest_booking_unit !== 0) {
        return "Duration must be divisible by smallest booking unit";
    }

    if (body.duration && body.start_time && (body.start_time * 1000 + body.duration * 60 * 1000) <= Date.now()) {
        return "Booking must be for a future time";
    }

    return undefined;
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const validationErrors = validateVenueInput(body);
        if (validationErrors) {
            return createResponse(400, { message: validationErrors }, origin);
        }

        const venue_id = body?.venue_id ?? randomUUID();

        let slot_time = body.start_time;
        let duration = 0;
        while (true) {
            await addItem(
                process.env.VENUES_BOOKINGS_TABLE_NAME as string,
                {
                    venue_id,
                    slot_time,
                    ttl: slot_time + 86400,
                    name: body.name,
                    user_id: 'Created by Admin'
                }
            );

            duration += body.smallest_booking_unit;
            slot_time += body.smallest_booking_unit * 60;
            if (duration >= body.duration) {
                break;
            }
        }

        return createResponse(200, { message: "Successfully created booking."}, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};