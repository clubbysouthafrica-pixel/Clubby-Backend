import { randomUUID } from "crypto";
import {
	createResponse,
	deconstructEvent,
	getItem,
	addItem
} from "./function_helpers";

type PricingType = "FREE" | "SINGLE" | "MULTIPLE" | "ADDITIONAL";
type InputType = "TEXT" | "DROPDOWN" | "CHECKBOX";

interface EventPricingOption {
	id: string;
	label: string;
	amount: number;
}

interface EventPricing {
	type: PricingType;
	fieldName?: string;
	options: EventPricingOption[];
}

interface EventFormField {
	id: string;
	label: string;
	inputType: InputType;
	required: boolean;
	placeholder: string;
	options: string[];
}

interface StoredEvent {
	club_account_id: string;
	event_id: string;
	title: string;
	description?: string;
	registrationOpenDate: number;
	registrationCloseDate: number;
	pricing: EventPricing;
	formFields: EventFormField[];
}

interface RegistrationFieldInput {
	field_id: string;
	field_label: string;
	input_type: InputType;
	value: string | boolean;
}

interface RegisterEventRequest {
	club_account_id: string;
	event_id: string;
	user_id: string;
	entry_fee_amount: number;
	pricing_type: PricingType;
	selected_pricing_option_ids: string[];
	registration_fields: RegistrationFieldInput[];
}

function toEpochMs(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}

	return value < 1_000_000_000_000 ? value * 1000 : value;
}

function normalizePricingType(value: unknown): PricingType | null {
	if (value === "FREE" || value === "SINGLE" || value === "MULTIPLE" || value === "ADDITIONAL") {
		return value;
	}

	if (value === "ADDITIVE") {
		return "ADDITIONAL";
	}

	return null;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isValidAmount(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateRequestShape(body: any): string[] {
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

	if (!isNonEmptyString(body.user_id)) {
		errors.push("user_id is required.");
	}

	if (!isValidAmount(body.entry_fee_amount)) {
		errors.push("entry_fee_amount is required and must be a valid number greater than or equal to 0.");
	}

	if (!normalizePricingType(body.pricing_type)) {
		errors.push("pricing_type must be one of FREE, SINGLE, MULTIPLE, ADDITIONAL.");
	}

	if (!Array.isArray(body.selected_pricing_option_ids)) {
		errors.push("selected_pricing_option_ids must be an array.");
	} else {
		body.selected_pricing_option_ids.forEach((optionId: unknown, index: number) => {
			if (!isNonEmptyString(optionId)) {
				errors.push(`selected_pricing_option_ids[${index}] must be a non-empty string.`);
			}
		});
	}

	if (!Array.isArray(body.registration_fields) || body.registration_fields.length === 0) {
		errors.push("registration_fields is required and must be a non-empty array.");
	} else {
		body.registration_fields.forEach((field: any, index: number) => {
			const prefix = `registration_fields[${index}]`;

			if (!field || typeof field !== "object") {
				errors.push(`${prefix} must be an object.`);
				return;
			}

			if (!isNonEmptyString(field.field_id)) {
				errors.push(`${prefix}.field_id is required.`);
			}

			if (!isNonEmptyString(field.field_label)) {
				errors.push(`${prefix}.field_label is required.`);
			}

			if (field.input_type !== "TEXT" && field.input_type !== "DROPDOWN" && field.input_type !== "CHECKBOX") {
				errors.push(`${prefix}.input_type must be one of TEXT, DROPDOWN, CHECKBOX.`);
			}

			if (field.input_type === "CHECKBOX") {
				if (typeof field.value !== "boolean") {
					errors.push(`${prefix}.value must be a boolean for CHECKBOX fields.`);
				}
				return;
			}

			if (!isNonEmptyString(field.value)) {
				errors.push(`${prefix}.value must be a non-empty string for ${field.input_type} fields.`);
			}
		});
	}

	return errors;
}

function validateAgainstEvent(body: RegisterEventRequest, storedEvent: StoredEvent, authUserId?: string): string[] {
	const errors: string[] = [];

	if (authUserId && body.user_id !== authUserId) {
		errors.push("user_id does not match the authenticated user.");
	}

	const pricingType = normalizePricingType(body.pricing_type);
	const eventPricingType = normalizePricingType(storedEvent.pricing?.type);

	if (!pricingType || !eventPricingType) {
		errors.push("The event pricing configuration is invalid.");
		return errors;
	}

	if (pricingType !== eventPricingType) {
		errors.push("pricing_type does not match the event pricing configuration.");
	}

	const selectedOptionIds = Array.from(new Set(body.selected_pricing_option_ids.map((optionId) => optionId.trim())));
	if (selectedOptionIds.length !== body.selected_pricing_option_ids.length) {
		errors.push("selected_pricing_option_ids must not contain duplicates.");
	}

	const pricingOptions = Array.isArray(storedEvent.pricing?.options) ? storedEvent.pricing.options : [];
	const pricingOptionMap = new Map(pricingOptions.map((option) => [option.id, option]));
	const selectedOptions = selectedOptionIds.map((optionId) => pricingOptionMap.get(optionId)).filter(Boolean) as EventPricingOption[];

	if (selectedOptions.length !== selectedOptionIds.length) {
		errors.push("selected_pricing_option_ids contains one or more invalid option ids.");
	}

	let expectedAmount = 0;

	if (eventPricingType === "FREE") {
		if (selectedOptionIds.length !== 0) {
			errors.push("selected_pricing_option_ids must be empty for FREE pricing.");
		}
		if (body.entry_fee_amount !== 0) {
			errors.push("entry_fee_amount must be 0 for FREE pricing.");
		}
	}

	if (eventPricingType === "SINGLE") {
		if (pricingOptions.length !== 1) {
			errors.push("The event pricing configuration must contain exactly one pricing option for SINGLE pricing.");
		}
		if (selectedOptionIds.length !== 1) {
			errors.push("selected_pricing_option_ids must contain exactly one option id for SINGLE pricing.");
		}

		expectedAmount = pricingOptions[0]?.amount ?? 0;
		if (selectedOptions[0] && pricingOptions[0] && selectedOptions[0].id !== pricingOptions[0].id) {
			errors.push("selected_pricing_option_ids must reference the configured SINGLE pricing option.");
		}
	}

	if (eventPricingType === "MULTIPLE") {
		if (selectedOptionIds.length !== 1) {
			errors.push("selected_pricing_option_ids must contain exactly one option id for MULTIPLE pricing.");
		}

		expectedAmount = selectedOptions[0]?.amount ?? 0;
	}

	if (eventPricingType === "ADDITIONAL") {
		if (selectedOptionIds.length === 0) {
			errors.push("selected_pricing_option_ids must contain at least one option id for ADDITIONAL pricing.");
		}

		expectedAmount = selectedOptions.reduce((total, option) => total + option.amount, 0);
	}

	if (body.entry_fee_amount !== expectedAmount) {
		errors.push(`entry_fee_amount must equal ${expectedAmount} for the selected pricing options.`);
	}

	const eventFields = Array.isArray(storedEvent.formFields) ? storedEvent.formFields : [];
	const eventFieldMap = new Map(eventFields.map((field) => [field.id, field]));
	const seenFieldIds = new Set<string>();

	body.registration_fields.forEach((field, index) => {
		const prefix = `registration_fields[${index}]`;
		const fieldId = field.field_id.trim();

		if (seenFieldIds.has(fieldId)) {
			errors.push(`${prefix}.field_id must be unique.`);
			return;
		}

		seenFieldIds.add(fieldId);

		const eventField = eventFieldMap.get(fieldId);
		if (!eventField) {
			errors.push(`${prefix}.field_id does not exist on the event.`);
			return;
		}

		if (field.field_label.trim() !== eventField.label) {
			errors.push(`${prefix}.field_label does not match the event field label.`);
		}

		if (field.input_type !== eventField.inputType) {
			errors.push(`${prefix}.input_type does not match the event field input type.`);
		}

		if (eventField.inputType === "TEXT") {
			if (!isNonEmptyString(field.value)) {
				errors.push(`${prefix}.value must be a non-empty string.`);
			}
		}

		if (eventField.inputType === "DROPDOWN") {
			if (!isNonEmptyString(field.value)) {
				errors.push(`${prefix}.value must be a non-empty string.`);
			} else if (!eventField.options.includes(field.value.trim())) {
				errors.push(`${prefix}.value must be one of the configured dropdown options.`);
			}
		}

		if (eventField.inputType === "CHECKBOX") {
			if (typeof field.value !== "boolean") {
				errors.push(`${prefix}.value must be a boolean.`);
			} else if (eventField.required && field.value !== true) {
				errors.push(`${prefix}.value must be true for a required checkbox field.`);
			}
		}
	});

	eventFields.forEach((field) => {
		if (field.required && !seenFieldIds.has(field.id)) {
			errors.push(`Required event field ${field.id} is missing from registration_fields.`);
		}
	});

	return errors;
}

async function addToTransactionsTable(
	club_account_id: string,
	first_name: string,
	surname: string,
	transaction_id: string,
	user_id: string,
	order_amount: number,
	event_registration_id: string,
	event_id: string
) {
	await addItem(
		process.env.TRANSACTIONS_TABLE_NAME as string,
		{
			club_account_id: club_account_id,
			name: `${first_name} ${surname}`,
			transaction_id: transaction_id,
			event_registration_id: event_registration_id,
			event_id: event_id,
			user_id: user_id as string,
			amount_paid: 0,
			club_income: true,
			amount: order_amount,
			creation_date: Date.now(),
			lifecycle: {
				[Date.now()]: {
					description: "Event registration submission",
					amount: order_amount,
					type: "SUBMISSION"
				}
			},
			type: "EVENT REGISTRATION",
			status: "PENDING"
		}
	)
}

export const handler = async (event: any) => {
	const { origin, body, user_id } = deconstructEvent(event);

	try {
		const requestErrors = validateRequestShape(body);
		if (requestErrors.length > 0) {
			return createResponse(400, {
				message: "Validation failed.",
				errors: requestErrors,
			}, origin);
		}

		const storedEvent = await getItem(process.env.EVENT_TABLE_NAME as string, {
			club_account_id: body.club_account_id,
			event_id: body.event_id,
		}) as StoredEvent | null;

		if (!storedEvent) {
			return createResponse(404, { message: "Event not found." }, origin);
		}

		const eventErrors = validateAgainstEvent(body as RegisterEventRequest, storedEvent, user_id);
		if (eventErrors.length > 0) {
			return createResponse(400, {
				message: "Event validation failed.",
				errors: eventErrors,
			}, origin);
		}

		const event_registration_id = randomUUID();
		const transaction_id = randomUUID();
		await addItem(process.env.EVENT_REGISTRATIONS_TABLE_NAME as string, {
			...body,
			event_registration_id: event_registration_id,
			transaction_id: transaction_id,
			amount_paid: 0,
			submitted_on: Date.now()
		});

		const club_member = await getItem(
			process.env.CLUB_MEMBER_TABLE_NAME as string,
			{
				club_account_id: body.club_account_id,
				user_id: user_id as string
			}
		)

		if (!club_member) {
			return createResponse(400, { message: "User is not a member of the club." }, origin);
		}

		await addToTransactionsTable(
			body.club_account_id,
			club_member.member_first_name,
			club_member.member_surname,
			transaction_id,
			user_id as string,
			body.entry_fee_amount,
			event_registration_id,
			body.event_id
		);

		return createResponse(200, {
			message: "Event registration payload is valid.",
			event_id: body.event_id,
			event_registration_id: event_registration_id
		}, origin);
	} catch (error: any) {
		console.error("event register error:", error);
		return createResponse(500, { message: error?.message || "Internal Server Error" }, origin);
	}
};
