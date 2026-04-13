import {
	createResponse,
	deconstructEvent,
	getItem,
	updateItem,
} from "./function_helpers/index";

async function updateTransaction(
	club_account_id: string,
	transaction_id: string,
	payment_amount: number,
	status: "PAID" | "PARTIALLY PAID",
) {
	await updateItem(
		process.env.TRANSACTIONS_TABLE_NAME as string,
		{
			club_account_id,
			transaction_id,
		},
		"SET #amount_paid = #amount_paid + :amount_paid, #status = :status, #lifecycle.#ts = :lifecycle_value",
		{
			"#amount_paid": "amount_paid",
			"#status": "status",
			"#lifecycle": "lifecycle",
			"#ts": `${Date.now()}`,
		},
		{
			":amount_paid": payment_amount,
			":status": status,
			":lifecycle_value": {
				type: "CONFIRMATION",
				description: "Payment confirmation",
				amount: payment_amount,
				payment_type: "EFT/Cash",
			},
		},
	);
}

async function updateEventRegistration(
	event_id: string,
	event_registration_id: string,
	amount_paid: number,
	payment_status: "PAID" | "PARTIALLY PAID",
	auto_confirm: boolean
) {
	await updateItem(
		process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
		{
			event_id,
			event_registration_id,
		},
		"SET #amount_paid = #amount_paid + :amount_paid, #payment_status = :payment_status, #confirmed_status = :confirmed_status",
		{
			"#amount_paid": "amount_paid",
			"#payment_status": "payment_status",
			"#confirmed_status": "confirmed_status",
		},
		{
			":amount_paid": amount_paid,
			":payment_status": payment_status,
			":confirmed_status": auto_confirm
		},
	);
}

export const handler = async (event: any) => {
	const { origin, body } = deconstructEvent(event);

	try {
		const {
			club_account_id,
			event_id,
			event_registration_id,
			transaction_id,
			amount_paid,
		} = body;

		if (
			!club_account_id ||
			!event_id ||
			!event_registration_id ||
			!transaction_id ||
			typeof amount_paid !== "number" ||
			amount_paid <= 0
		) {
			return createResponse(400, {
				message: "club_account_id, event_id, event_registration_id, transaction_id and amount_paid are required.",
			}, origin);
		}

		const event_registration = await getItem(
			process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
			{
				event_id,
				event_registration_id,
			},
		);

		const selected_event = await getItem(
			process.env.EVENTS_TABLE_NAME as string,
			{
				club_account_id: club_account_id,
				event_id: event_id
			}
		);
		if (selected_event == null) {
			return { statusCode: 404, body: "Event not found." };
		}

		if (!event_registration) {
			return createResponse(404, { message: "Event registration not found." }, origin);
		}

		if (event_registration.club_account_id !== club_account_id) {
			return createResponse(400, {
				message: "The event registration does not belong to the supplied club_account_id.",
			}, origin);
		}

		if (event_registration.transaction_id !== transaction_id) {
			return createResponse(400, {
				message: "The event registration does not match the supplied transaction_id.",
			}, origin);
		}

		const transaction = await getItem(
			process.env.TRANSACTIONS_TABLE_NAME as string,
			{
				club_account_id,
				transaction_id,
			},
		);

		if (!transaction) {
			return createResponse(404, { message: "Transaction not found." }, origin);
		}

		if (transaction.event_id !== event_id || transaction.event_registration_id !== event_registration_id) {
			return createResponse(400, {
				message: "The transaction does not match the supplied event registration.",
			}, origin);
		}

		const outstanding_event_registration_amount =
			(event_registration.entry_fee_amount ?? 0) - (event_registration.amount_paid ?? 0);
		const outstanding_transaction_amount =
			(transaction.amount ?? 0) - (transaction.amount_paid ?? 0);

		if (outstanding_event_registration_amount < 0 || outstanding_transaction_amount < 0) {
			return createResponse(400, {
				message: "The payment records are in an invalid state.",
			}, origin);
		}

		if (outstanding_event_registration_amount === 0 && outstanding_transaction_amount === 0) {
			return createResponse(200, {
				message: "Event registration payment has already been confirmed.",
			}, origin);
		}

		if (outstanding_event_registration_amount !== outstanding_transaction_amount) {
			return createResponse(400, {
				message: "The outstanding event registration amount does not match the outstanding transaction amount.",
			}, origin);
		}

		if (amount_paid > outstanding_event_registration_amount) {
			return createResponse(400, {
				message: "Payment amount exceeds the outstanding event registration amount.",
			}, origin);
		}

		const payment_status = amount_paid === outstanding_event_registration_amount
			? "PAID"
			: "PARTIALLY PAID";

		await updateTransaction(
			club_account_id,
			transaction_id,
			amount_paid,
			payment_status,
		);

		await updateEventRegistration(
			event_id,
			event_registration_id,
			amount_paid,
			payment_status,
			selected_event?.autoConfirmIfPaid ?? true
		);

		return createResponse(200, {
			message: payment_status === "PAID"
				? "Event registration payment confirmed."
				: "Event registration payment partially confirmed.",
		}, origin);
	} catch (error) {
		console.error("Error:", error);
		return createResponse(500, { message: "Internal Server Error" }, origin);
	}
};
