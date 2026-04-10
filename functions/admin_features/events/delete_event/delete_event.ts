import {
	createResponse,
	deconstructEvent,
	getItem,
	removeItem,
} from "./function_helpers";

interface StoredEvent {
	club_account_id: string;
	event_id: string;
	registrationOpenDate?: number;
}

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
	const { origin, body } = deconstructEvent(event);

	try {
		if (!process.env.EVENTS_TABLE_NAME) {
			return createResponse(500, { message: "EVENTS_TABLE_NAME is not configured." }, origin);
		}

		const club_account_id = typeof body?.club_account_id === "string" && body.club_account_id.trim()
			? body.club_account_id.trim()
			: "";

		const event_id = typeof body?.event_id === "string" && body.event_id.trim()
			? body.event_id.trim()
			: typeof body?.id === "string" && body.id.trim()
				? body.id.trim()
				: "";

		if (!club_account_id || !event_id) {
			return createResponse(400, {
				message: "club_account_id and event_id are required.",
			}, origin);
		}

		const storedEvent = await getItem(process.env.EVENTS_TABLE_NAME, {
			club_account_id,
			event_id,
		}) as StoredEvent | null;

		if (!storedEvent) {
			return createResponse(404, { message: "Event not found." }, origin);
		}

		const registrationOpenDay = toUtcDayStartMs(storedEvent.registrationOpenDate);
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		if (registrationOpenDay !== null && registrationOpenDay <= today.getTime()) {
			return createResponse(400, {
				message: "The event cannot be deleted as registrations have already opened.",
			}, origin);
		}

		await removeItem(process.env.EVENTS_TABLE_NAME, {
			club_account_id,
			event_id,
		});

		return createResponse(200, {
			message: "Event deleted successfully.",
			event_id,
		}, origin);
	} catch (error: any) {
		console.error("delete_event error:", error);
		return createResponse(500, { message: error?.message || "Internal Server Error" }, origin);
	}
};
