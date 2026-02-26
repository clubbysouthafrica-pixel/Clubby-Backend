import {
    createResponse,
    deconstructEvent,
    queryItems,
} from "./function_helpers";
import { randomUUID } from "crypto";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!query_string_params.venue_id) {
            return createResponse(400, { message: "Venue ID query parameter is required" }, origin);
        }

        if (!query_string_params.start_slot_time) {
            return createResponse(400, { message: "Start Slot Time query parameter is required" }, origin);
        }

        if (!query_string_params.end_slot_time) {
            return createResponse(400, { message: "End Slot Time query parameter is required" }, origin);
        }

        const startSlotTime = Number(query_string_params.start_slot_time);
        const endSlotTime = Number(query_string_params.end_slot_time);

        if (isNaN(startSlotTime) || isNaN(endSlotTime)) {
            return createResponse(400, { message: "Start Slot Time and End Slot Time must be valid numbers (epoch)" }, origin);
        }

        const bookings = await queryItems(
            process.env.VENUES_BOOKINGS_TABLE_NAME as string,
            "venue_id = :venue_id AND slot_time BETWEEN :start_slot_time AND :end_slot_time",
            {
                ":venue_id": query_string_params.venue_id,
                ":start_slot_time": startSlotTime,
                ":end_slot_time": endSlotTime,
            }
        );

        return createResponse(200, { bookings }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};