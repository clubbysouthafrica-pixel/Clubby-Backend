import {
	addItem,
	createResponse,
	deconstructEvent,
} from "./function_helpers";
import { randomUUID } from "crypto";

type FormInputType = "TEXT" | "DROPDOWN" | "CHECKBOX";
type PricingType = "FREE" | "SINGLE" | "MULTIPLE" | "ADDITIONAL";
type PricingTypeInput = PricingType | "ADDITIVE";

interface EventFormFieldInput {
	id?: string;
	label?: string;
	inputType?: FormInputType;
	required?: boolean;
	placeholder?: string;
	options?: string[];
}

interface PricingOptionInput {
	id?: string;
	label?: string;
	amount: string | number;
}

interface PricingInput {
	type: PricingTypeInput;
	fieldName?: string | null;
	options?: PricingOptionInput[];
}

interface RegistrationTagInput {
	id?: string;
	label?: string;
}

interface EventRegistrationInput {
	autoConfirmIfPaid?: boolean;
	allowMemberRegistrationOnce?: boolean;
	registrationTags?: RegistrationTagInput[];
}

interface EventRequestBody {
	id?: string;
	event_id?: string;
	club_account_id?: string;
	title: string;
	description?: string;
	startDate: number;
	endDate: number;
	registrationOpenDate: number;
	registrationCloseDate: number;
	formFields: EventFormFieldInput[];
	pricing: PricingInput;
	eventRegistration?: EventRegistrationInput;
	previewFieldOrder?: string[];
}

interface NormalizedPricingOption {
	id: string;
	label: string;
	amount: number;
}

interface NormalizedPricing {
	type: PricingType;
	fieldName?: string;
	options: NormalizedPricingOption[];
}

interface NormalizedEventField {
	id: string;
	label: string;
	inputType: FormInputType;
	required: boolean;
	placeholder: string;
	options: string[];
}

interface NormalizedRegistrationTag {
	id: string;
	label: string;
}

interface NormalizedEventPayload {
	club_account_id?: string;
	title: string;
	description?: string;
	startDate: number;
	endDate: number;
	registrationOpenDate: number;
	registrationCloseDate: number;
	formFields: NormalizedEventField[];
	pricing: NormalizedPricing;
	autoConfirmIfPaid: boolean;
	allowMemberRegistrationOnce: boolean;
	registrationTags?: NormalizedRegistrationTag[];
	previewFieldOrder: string[];
	createdAt: string;
	updatedAt: string;
	createdBy?: string;
}

const PRICING_FIELD_ID = "pricing-field";

function toEpochMs(value: number): number {
	return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toUtcDayStartMs(value: number): number {
	const date = new Date(toEpochMs(value));
	date.setUTCHours(0, 0, 0, 0);
	return date.getTime();
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function isPositiveEpoch(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizePricingType(type: PricingTypeInput | undefined): PricingType | null {
	if (type === "ADDITIVE") {
		return "ADDITIONAL";
	}

	if (type === "FREE" || type === "SINGLE" || type === "MULTIPLE" || type === "ADDITIONAL") {
		return type;
	}

	return null;
}

function sanitizePreviewFieldOrder(
	previewFieldOrder: unknown,
	formFields: NormalizedEventField[],
	includePricingField: boolean,
): string[] {
	const validIds = [
		...formFields.map(field => field.id),
		...(includePricingField ? [PRICING_FIELD_ID] : []),
	];
	const validIdSet = new Set(validIds);
	const sanitized: string[] = [];
	const seen = new Set<string>();

	if (Array.isArray(previewFieldOrder)) {
		for (const rawValue of previewFieldOrder) {
			if (typeof rawValue !== "string") {
				continue;
			}

			const trimmedValue = rawValue.trim();
			if (!trimmedValue || !validIdSet.has(trimmedValue) || seen.has(trimmedValue)) {
				continue;
			}

			sanitized.push(trimmedValue);
			seen.add(trimmedValue);
		}
	}

	for (const validId of validIds) {
		if (!seen.has(validId)) {
			sanitized.push(validId);
			seen.add(validId);
		}
	}

	return sanitized;
}

function getNormalizedFieldOptions(options: unknown): string[] {
	if (!Array.isArray(options)) {
		return [];
	}

	return options
		.filter((option): option is string => typeof option === "string")
		.map(option => option.trim())
		.filter(option => option.length > 0);
}

function hasConfigurableFieldContent(field: EventFormFieldInput | undefined): boolean {
	const id = typeof field?.id === "string" ? field.id.trim() : "";
	const label = typeof field?.label === "string" ? field.label.trim() : "";
	const placeholder = typeof field?.placeholder === "string" ? field.placeholder.trim() : "";
	const options = getNormalizedFieldOptions(field?.options);

	return Boolean(id || label || placeholder || options.length > 0);
}

function buildFieldId(field: EventFormFieldInput | undefined, index: number, label: string): string {
	const providedId = typeof field?.id === "string" ? field.id.trim() : "";
	if (providedId) {
		return providedId;
	}

	const slugifiedLabel = slugify(label);
	if (slugifiedLabel) {
		return slugifiedLabel;
	}

	return `field-${index + 1}`;
}

function normalizeRegistrationTags(
	registrationTags: unknown,
	autoConfirmIfPaid: boolean,
	errors: string[],
): NormalizedRegistrationTag[] | undefined {
	if (registrationTags === undefined) {
		return undefined;
	}

	if (autoConfirmIfPaid) {
		errors.push("registrationTags can only be provided when autoConfirmIfPaid is false.");
		return undefined;
	}

	if (!Array.isArray(registrationTags)) {
		errors.push("registrationTags must be an array when provided.");
		return undefined;
	}

	const normalizedRegistrationTags: NormalizedRegistrationTag[] = [];

	registrationTags.forEach((tag, index) => {
		const prefix = `registrationTags[${index}]`;
		const label = typeof tag?.label === "string" ? tag.label.trim() : "";

		if (typeof tag?.id === "string" && tag.id.trim()) {
			errors.push(`${prefix}.id must not be provided.`);
		}

		if (!label) {
			errors.push(`${prefix}.label is required.`);
			return;
		}

		normalizedRegistrationTags.push({
			id: randomUUID(),
			label,
		});
	});

	return normalizedRegistrationTags;
}

function validateAndNormalizeBody(body: EventRequestBody, userId?: string, clubAccountIdFromQuery?: string | null): { value?: NormalizedEventPayload; errors?: string[] } {
	const errors: string[] = [];

	if (!body || typeof body !== "object") {
		return { errors: ["Request body is required."] };
	}

	const title = typeof body.title === "string" ? body.title.trim() : "";
	if (!title) {
		errors.push("title is required.");
	}

	if (typeof body.eventRegistration?.autoConfirmIfPaid !== "boolean") {
		errors.push("autoConfirmIfPaid must be provided as a boolean.");
	}

	const autoConfirmIfPaid = body.eventRegistration?.autoConfirmIfPaid === true;
	const allowMemberRegistrationOnce = body.eventRegistration?.allowMemberRegistrationOnce === true;

	const startDate = body.startDate;
	const endDate = body.endDate;
	const registrationOpenDate = body.registrationOpenDate;
	const registrationCloseDate = body.registrationCloseDate;

	if (!isPositiveEpoch(startDate)) {
		errors.push("The Start Date is required.");
	}
	if (!isPositiveEpoch(endDate)) {
		errors.push("The End Date is required.");
	}
	if (!isPositiveEpoch(registrationOpenDate)) {
		errors.push("The Registration Open Date is required.");
	}
	if (!isPositiveEpoch(registrationCloseDate)) {
		errors.push("The Registration Close Date is required.");
	}

	if (errors.length === 0) {
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		const startDay = toUtcDayStartMs(startDate);
		const endDay = toUtcDayStartMs(endDate);
		const registrationOpenDay = toUtcDayStartMs(registrationOpenDate);
		const registrationCloseDay = toUtcDayStartMs(registrationCloseDate);

		if (endDay < startDay) {
			errors.push("The End Date cannot be before the Start Date.");
		}
		if (registrationCloseDay < registrationOpenDay) {
			errors.push("The Registration Close Date cannot be before the Registration Open Date.");
		}
		if (registrationCloseDay > startDay) {
			errors.push("The Registration Close Date must be on or before the Start Date.");
		}
	}

	if (body.formFields !== undefined && !Array.isArray(body.formFields)) {
		errors.push("formFields must be an array when provided.");
	}

	const normalizedFormFields: NormalizedEventField[] = [];
	const seenFieldIds = new Set<string>();

	if (Array.isArray(body.formFields)) {
		body.formFields.forEach((field, index) => {
			const prefix = `formFields[${index}]`;
			const label = typeof field?.label === "string" ? field.label.trim() : "";
			const inputType = field?.inputType;
			const placeholder = typeof field?.placeholder === "string" ? field.placeholder.trim() : "";
			const required = typeof field?.required === "boolean" ? field.required : false;
			const options = getNormalizedFieldOptions(field?.options);

			if (!hasConfigurableFieldContent(field)) {
				return;
			}

			if (inputType !== "TEXT" && inputType !== "DROPDOWN" && inputType !== "CHECKBOX") {
				errors.push(`${prefix}.inputType must be one of TEXT, DROPDOWN, CHECKBOX.`);
				return;
			}

			if (!label) {
				return;
			}

			if (inputType === "DROPDOWN" && options.length === 0) {
				return;
			}

			const id = buildFieldId(field, index, label);

			if (seenFieldIds.has(id)) {
				errors.push(`${prefix}.id must be unique.`);
			} else {
				seenFieldIds.add(id);
			}

			if (inputType === "TEXT" || inputType === "CHECKBOX") {
				if (options.length > 0) {
					errors.push(`${prefix}.options must be empty for ${inputType}.`);
				}
			}

			if (inputType === "DROPDOWN") {
				const validOptions = options.filter(option => option.length > 0);
				if (validOptions.length === 0) {
					return;
				}
			}

			normalizedFormFields.push({
				id,
				label,
				inputType,
				required,
				placeholder,
				options: inputType === "DROPDOWN" ? options : [],
			});
		});
	}

	const normalizedPricingType = normalizePricingType(body.pricing?.type);
	if (!normalizedPricingType) {
		errors.push("pricing.type must be one of FREE, SINGLE, MULTIPLE, ADDITIONAL.");
	}

	const normalizedPricingOptions: NormalizedPricingOption[] = [];
	const rawPricingOptions = Array.isArray(body.pricing?.options) ? body.pricing.options : [];

	rawPricingOptions.forEach((option, index) => {
		const prefix = `pricing.options[${index}]`;
		const optionId = typeof option?.id === "string" && option.id.trim() ? option.id.trim() : `pricing-option-${index + 1}`;
		const label = typeof option?.label === "string" ? option.label.trim() : "";
		const parsedAmount = typeof option?.amount === "string"
			? Number(option.amount.trim())
			: option?.amount;

		if (typeof parsedAmount !== "number" || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
			errors.push(`${prefix}.amount must be a valid positive number.`);
			return;
		}

		normalizedPricingOptions.push({
			id: optionId,
			label,
			amount: parsedAmount,
		});
	});

	let normalizedPricing: NormalizedPricing = {
		type: normalizedPricingType ?? "FREE",
		options: [],
	};

	if (normalizedPricingType === "FREE") {
		normalizedPricing = {
			type: "FREE",
			options: [],
		};
	} else if (normalizedPricingType === "SINGLE") {
		if (normalizedPricingOptions.length !== 1) {
			errors.push("pricing.options must contain exactly one item for SINGLE pricing.");
		}

		normalizedPricing = {
			type: "SINGLE",
			options: normalizedPricingOptions.slice(0, 1).map(option => ({
				...option,
				label: option.label || "Fixed price",
			})),
		};
	} else if (normalizedPricingType === "MULTIPLE" || normalizedPricingType === "ADDITIONAL") {
		if (normalizedPricingOptions.length === 0) {
			errors.push(`pricing.options must contain at least one item for ${normalizedPricingType} pricing.`);
		}

		const fieldName = typeof body.pricing?.fieldName === "string" ? body.pricing.fieldName.trim() : "";
		normalizedPricing = {
			type: normalizedPricingType,
			fieldName: fieldName || "Entry option",
			options: normalizedPricingOptions.map(option => ({
				...option,
				label: option.label,
			})),
		};

		const missingLabels = normalizedPricing.options.filter(option => !option.label);
		if (missingLabels.length > 0) {
			errors.push(`pricing.options must include labels for ${normalizedPricingType} pricing.`);
		}
	}

	const includePricingField = normalizedPricing.type === "MULTIPLE" || normalizedPricing.type === "ADDITIONAL";
	const registrationTags = normalizeRegistrationTags(body.eventRegistration?.registrationTags, autoConfirmIfPaid, errors);
	const previewFieldOrder = sanitizePreviewFieldOrder(body.previewFieldOrder, normalizedFormFields, includePricingField);

	if (errors.length > 0) {
		return { errors };
	}

	const timestamp = new Date().toISOString();
	const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : undefined;
	const clubAccountId = typeof body.club_account_id === "string" && body.club_account_id.trim()
		? body.club_account_id.trim()
		: typeof clubAccountIdFromQuery === "string" && clubAccountIdFromQuery.trim()
			? clubAccountIdFromQuery.trim()
			: undefined;

	return {
		value: {
			club_account_id: clubAccountId,
			title,
			description,
			startDate,
			endDate,
			registrationOpenDate,
			registrationCloseDate,
			formFields: normalizedFormFields,
			pricing: normalizedPricing,
			autoConfirmIfPaid,
			allowMemberRegistrationOnce,
			registrationTags,
			previewFieldOrder,
			createdAt: timestamp,
			updatedAt: timestamp,
			createdBy: userId,
		},
	};
}

function buildEventId(body: EventRequestBody, normalizedEvent: NormalizedEventPayload, forceNew: boolean): string {
	if (!forceNew && body?.id && String(body.id).trim()) {
		return String(body.id).trim();
	}

	return `${normalizedEvent.club_account_id}-${Date.now()}-${randomUUID()}`;
}

export const handler = async (event: any) => {

	const { origin, body, query_string_params, user_id } = deconstructEvent(event);

	try {
		if (!process.env.EVENTS_TABLE_NAME) {
			return createResponse(500, { message: "EVENTS_TABLE_NAME is not configured." }, origin);
		}

		if (Array.isArray(body)) {
			if (body.length === 0) {
				return createResponse(400, {
					message: "Validation failed.",
					errors: ["Request body array must contain at least one event."],
				}, origin);
			}

			if (body.length > 20) {
				return createResponse(400, {
					message: "No more than 20 events can be created at a time.",
				}, origin);
			}

			const validationErrors: string[] = [];
			const normalizedEvents: Array<{ body: EventRequestBody; normalizedEvent: NormalizedEventPayload }> = [];

			body.forEach((rawEvent, index) => {
				const validationResult = validateAndNormalizeBody(rawEvent as EventRequestBody, user_id, query_string_params?.club_account_id ?? null);

				if (validationResult.errors) {
					validationErrors.push(...validationResult.errors.map(validationError => `events[${index}]: ${validationError}`));
					return;
				}

				normalizedEvents.push({
					body: rawEvent as EventRequestBody,
					normalizedEvent: validationResult.value as NormalizedEventPayload,
				});
			});

			if (validationErrors.length > 0) {
				return createResponse(400, {
					message: "Validation failed.",
					errors: validationErrors,
				}, origin);
			}

			const event_ids: string[] = [];

			for (const item of normalizedEvents) {
				const event_id = buildEventId(item.body, item.normalizedEvent, true);
				event_ids.push(event_id);
				await addItem(process.env.EVENTS_TABLE_NAME, {
					event_id,
					...item.normalizedEvent,
				});
			}

			return createResponse(200, {
				message: "Events created successfully.",
				event_ids,
			}, origin);
		}

		const validationResult = validateAndNormalizeBody(body, user_id, query_string_params?.club_account_id ?? null);

		if (validationResult.errors) {
			return createResponse(400, {
				message: "Validation failed.",
				errors: validationResult.errors,
			}, origin);
		}

		const normalizedEvent = validationResult.value as NormalizedEventPayload;
		const event_id = buildEventId(body, normalizedEvent, false);
		await addItem(process.env.EVENTS_TABLE_NAME, {
			event_id,
			...normalizedEvent,
		});

		return createResponse(200, { message: "Event created/updated successfully.", event_id }, origin);
	} catch (error: any) {
		console.error("create_or_update_events error:", error);
		const message = error?.message || "Internal Server Error";
		const statusCode = error?.$metadata?.httpStatusCode || 500;
		return createResponse(statusCode, { message }, origin);
	}
};
