import {
	createResponse,
	deconstructEvent,
	removeItem,
} from "./function_helpers";

const validateDeleteBookingInput = (body: any) => {

	if (!body?.venue_id || typeof body.venue_id !== "string" || body.venue_id.trim() === "") {
		return "Venue ID is required and must be a non-empty string";
	}

	if (body?.slot_time === undefined || typeof body.slot_time !== "number") {
		return "Slot Time is required and must be in epoch format";
	}

	return undefined;
};

export const handler = async (event: any) => {

	const { origin, body } = deconstructEvent(event);

	try {
		const validationErrors = validateDeleteBookingInput(body);
		if (validationErrors) {
			return createResponse(400, { message: validationErrors }, origin);
		}

		const deletedBooking = await removeItem(
			process.env.VENUES_BOOKINGS_TABLE_NAME as string,
			{
				venue_id: body.venue_id,
				slot_time: body.slot_time as any,
			}
			,
			true
		);

		if (!deletedBooking) {
			return createResponse(404, { message: "Booking not found." }, origin);
		}

		return createResponse(200, { message: "Successfully deleted booking." }, origin);
	} catch (error: any) {
		console.error("Error deleting booking:", error);
		return createResponse(500, { message: error.message }, origin);
	}
};
