import {
	createResponse,
	deconstructEvent,
	getItem,
	removeItem,
} from "./function_helpers";

interface DeleteRegistrationRequestBody {
	club_account_id?: string;
	event_id?: string;
	event_registration_id?: string;
}

interface StoredEventRegistration {
	club_account_id?: string;
	event_id: string;
	event_registration_id: string;
	transaction_id?: string;
}

interface StoredTransaction {
	club_account_id: string;
	transaction_id: string;
	event_id?: string;
	event_registration_id?: string;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validateRequestBody(body: DeleteRegistrationRequestBody): string[] {
	const errors: string[] = [];

	if (!body || typeof body !== "object") {
		return ["Request body is required."];
	}

	if (!isNonEmptyString(body.club_account_id)) {
		errors.push("club_account_id is required.");
	}

	if (!isNonEmptyString(body.event_id)) {
		errors.push("event_id is required.");
	}

	if (!isNonEmptyString(body.event_registration_id)) {
		errors.push("event_registration_id is required.");
	}

	return errors;
}

export const handler = async (event: any) => {
	const { origin, body } = deconstructEvent(event);

	try {
		const requestBody = body as DeleteRegistrationRequestBody;
		const requestErrors = validateRequestBody(requestBody);

		if (requestErrors.length > 0) {
			return createResponse(400, {
				message: "Validation failed.",
				errors: requestErrors,
			}, origin);
		}

		const club_account_id = requestBody.club_account_id!.trim();
		const event_id = requestBody.event_id!.trim();
		const event_registration_id = requestBody.event_registration_id!.trim();

		if (!process.env.EVENT_REGISTRATIONS_TABLE_NAME) {
			return createResponse(500, { message: "EVENT_REGISTRATIONS_TABLE_NAME is not configured." }, origin);
		}

		const event_registration = await getItem(
			process.env.EVENT_REGISTRATIONS_TABLE_NAME,
			{
				event_id,
				event_registration_id,
			},
		) as StoredEventRegistration | null;

		if (!event_registration) {
			return createResponse(404, { message: "Event registration not found." }, origin);
		}

		if (event_registration.club_account_id && event_registration.club_account_id.trim() !== club_account_id) {
			return createResponse(400, {
				message: "The event registration does not belong to the supplied club_account_id.",
			}, origin);
		}

		let deletedTransaction = false;
		const transaction_id = isNonEmptyString(event_registration.transaction_id)
			? event_registration.transaction_id.trim()
			: "";

		if (transaction_id) {
			if (!process.env.TRANSACTIONS_TABLE_NAME) {
				return createResponse(500, { message: "TRANSACTIONS_TABLE_NAME is not configured." }, origin);
			}

			const transaction = await getItem(
				process.env.TRANSACTIONS_TABLE_NAME,
				{
					club_account_id,
					transaction_id,
				},
			) as StoredTransaction | null;

			if (transaction) {
				if (transaction.event_id !== event_id || transaction.event_registration_id !== event_registration_id) {
					return createResponse(400, {
						message: "The transaction does not match the supplied event registration.",
					}, origin);
				}

				await removeItem(
					process.env.TRANSACTIONS_TABLE_NAME,
					{
						club_account_id,
						transaction_id,
					},
				);
				deletedTransaction = true;
			}
		}

		await removeItem(
			process.env.EVENT_REGISTRATIONS_TABLE_NAME,
			{
				event_id,
				event_registration_id,
			},
		);

		return createResponse(200, {
			message: deletedTransaction
				? "Event registration and associated transaction deleted."
				: "Event registration deleted.",
			event_id,
			event_registration_id,
			deleted_transaction: deletedTransaction,
		}, origin);
	} catch (error: any) {
		console.error("delete_registration error:", error);
		return createResponse(500, { message: error?.message || "Internal Server Error" }, origin);
	}
};
