import { createResponse, deconstructEvent, removeItem, } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);
    try {

        if (body?.venue_id == null) {
            return createResponse(400, { message: 'Venue ID required.' }, origin);
        }
        if (body?.slot_time == null) {
            return createResponse(400, { message: 'Slot Time required.' }, origin);
        }

        await removeItem(
            process.env.VENUES_BOOKINGS_TABLE_NAME as string,
            {
                venue_id: body.venue_id,
                slot_time: body.slot_time
            }
        )

        return createResponse(200, { message: `Booking successfully removed.` }, origin);

    } catch (error: any) {
        console.error('Remove booking error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
