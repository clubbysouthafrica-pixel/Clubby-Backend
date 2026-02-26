import {
    createResponse,
    deconstructEvent,
    addItem,
} from "./function_helpers";
import { randomUUID } from "crypto";

const validateVenueInput = (body: any) => {

    if (!body.club_account_id || typeof body.club_account_id !== "string" || body.club_account_id.trim() === "") {
        return "Club Account ID is required and must be a non-empty string";
    }
    if (!body.venue_name || typeof body.venue_name !== "string" || body.venue_name.trim() === "") {
        return "Venue Name is required and must be a non-empty string";
    }

    if (!body.smallest_booking_unit || typeof body.smallest_booking_unit !== "number" || body.smallest_booking_unit <= 0) {
        return "Smallest Booking Unit is required and must be a positive number (in minutes)"
    }

    if (!Array.isArray(body.times) || body.times.length === 0) {
        return "Times is required and must be a non-empty array"
    } else {
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        
        let message = undefined;
        body.times.forEach((time: any, index: number) => {
            if (typeof time.day_of_week !== "number" || time.day_of_week < 0 || time.day_of_week > 6) {
                message = `Times[${index}]: day_of_week must be a number between 0 (Sunday) and 6 (Saturday)`;
                return;
            }

            if (!time.start_time || typeof time.start_time !== "string" || !timeRegex.test(time.start_time)) {
                message = `Times[${index}]: start_time is required and must be in HH:MM format`;
                return;
            }

            if (!time.end_time || typeof time.end_time !== "string" || !timeRegex.test(time.end_time)) {
                message = `Times[${index}]: end_time is required and must be in HH:MM format`;
                return;
            }

            if (time.start_time && time.end_time && time.start_time >= time.end_time) {
                message = `Times[${index}]: end_time must be after start_time`;
                return;
            }

            if (time.is_closed !== undefined && typeof time.is_closed !== "boolean") {
                message = `Times[${index}]: is_closed must be a boolean if provided`;
                return;
            }
        });

        if (message) {
            return message;
        }
    }

    if (body.smallest_booking_unit && body.max_daily_booking_time && body.smallest_booking_unit > body.max_daily_booking_time) {
        return "Smallest Booking Unit cannot exceed Max Daily Booking Time"
    }

    if (body.max_daily_booking_time && body.smallest_booking_unit && body.max_daily_booking_time % body.smallest_booking_unit !== 0) {
        return "Max Daily Booking Time must be a multiple of Smallest Booking Unit";
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
        
        await addItem(
            process.env.VENUES_TABLE_NAME as string,
            {
                venue_id,
                club_account_id: body.club_account_id,
                venue_name: body.venue_name,
                smallest_booking_unit: body.smallest_booking_unit,
                max_daily_booking_time: body.max_daily_booking_time ?? null,
                times: body.times
            }
        );

        return createResponse(200, { message: "Successfully created venue.", venue_id }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};