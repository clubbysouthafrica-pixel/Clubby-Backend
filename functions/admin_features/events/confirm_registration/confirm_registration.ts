import {
	createResponse,
	deconstructEvent,
	getItem,
	updateItem,
} from "./function_helpers";

interface RegistrationTagDefinition {
	id: string;
	label: string;
}

interface RegistrationTagValue extends RegistrationTagDefinition {
	value: string;
}

interface ConfirmRegistrationFieldInput {
	field_id?: string;
	field_label?: string;
	value?: unknown;
}

interface ConfirmRegistrationRequestBody {
	club_account_id?: string;
	event_id?: string;
	event_registration_id?: string;
	registration_fields?: ConfirmRegistrationFieldInput[];
}

interface StoredEvent {
	club_account_id: string;
	event_id: string;
	registrationTags?: RegistrationTagDefinition[];
	eventRegistration?: {
		registrationTags?: RegistrationTagDefinition[];
	};
}

interface StoredEventRegistration {
	event_id: string;
	event_registration_id: string;
	club_account_id?: string;
	registration_tags?: RegistrationTagValue[];
	confirmed_status?: boolean;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function getEventRegistrationTags(event: StoredEvent): RegistrationTagDefinition[] {
	const tags = Array.isArray(event.registrationTags)
		? event.registrationTags
		: Array.isArray(event.eventRegistration?.registrationTags)
			? event.eventRegistration.registrationTags
			: [];

	return tags.filter((tag): tag is RegistrationTagDefinition => {
		return Boolean(
			tag
			&& typeof tag.id === "string"
			&& tag.id.trim()
			&& typeof tag.label === "string"
			&& tag.label.trim(),
		);
	}).map((tag) => ({
		id: tag.id.trim(),
		label: tag.label.trim(),
	}));
}

function validateRequestBody(body: ConfirmRegistrationRequestBody): string[] {
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

	if (!Array.isArray(body.registration_fields)) {
		errors.push("registration_fields must be an array.");
		return errors;
	}

	body.registration_fields.forEach((field, index) => {
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

		if (!isNonEmptyString(field.value)) {
			errors.push(`${prefix}.value is required.`);
		}
	});

	return errors;
}

function buildRegistrationTags(
	configuredTags: RegistrationTagDefinition[],
	registrationFields: ConfirmRegistrationFieldInput[],
): { registration_tags: RegistrationTagValue[]; errors: string[] } {
	const errors: string[] = [];
	const registration_tags: RegistrationTagValue[] = [];
	const configuredTagMap = new Map(configuredTags.map((tag) => [tag.id, tag]));
	const seenTagIds = new Set<string>();

	registrationFields.forEach((field, index) => {
		const prefix = `registration_fields[${index}]`;
		const fieldId = typeof field.field_id === "string" ? field.field_id.trim() : "";
		const fieldLabel = typeof field.field_label === "string" ? field.field_label.trim() : "";
		const value = typeof field.value === "string" ? field.value.trim() : "";
		const tagIdPrefix = "event_registration_tag:";

		if (!fieldId.startsWith(tagIdPrefix)) {
			errors.push(`${prefix}.field_id must start with ${tagIdPrefix}.`);
			return;
		}

		const tagId = fieldId.slice(tagIdPrefix.length).trim();
		if (!tagId) {
			errors.push(`${prefix}.field_id must include a tag id.`);
			return;
		}

		if (seenTagIds.has(tagId)) {
			errors.push(`${prefix}.field_id must be unique.`);
			return;
		}

		seenTagIds.add(tagId);

		const configuredTag = configuredTagMap.get(tagId);
		if (!configuredTag) {
			errors.push(`${prefix}.field_id does not match a configured registration tag.`);
			return;
		}

		if (fieldLabel !== configuredTag.label) {
			errors.push(`${prefix}.field_label does not match the configured registration tag label.`);
		}

		if (!value) {
			errors.push(`${prefix}.value is required.`);
			return;
		}

		registration_tags.push({
			id: configuredTag.id,
			label: configuredTag.label,
			value,
		});
	});

	for (const configuredTag of configuredTags) {
		if (!seenTagIds.has(configuredTag.id)) {
			errors.push(`Missing registration field for tag ${configuredTag.label}.`);
		}
	}

	if (configuredTags.length === 0 && registrationFields.length > 0) {
		errors.push("registration_fields must be empty when the event has no registration tags.");
	}

	return { registration_tags, errors };
}

async function confirmEventRegistration(
	event_id: string,
	event_registration_id: string,
	registration_tags: RegistrationTagValue[],
) {
	await updateItem(
		process.env.EVENT_REGISTRATIONS_TABLE_NAME as string,
		{
			event_id,
			event_registration_id,
		},
		"SET #confirmed_status = :confirmed_status, #registration_tags = :registration_tags",
		{
			"#confirmed_status": "confirmed_status",
			"#registration_tags": "registration_tags",
		},
		{
			":confirmed_status": true,
			":registration_tags": registration_tags,
		},
	);
}

export const handler = async (event: any) => {
	const { origin, body } = deconstructEvent(event);

	try {
		const requestBody = body as ConfirmRegistrationRequestBody;
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
		const registration_fields = requestBody.registration_fields ?? [];

		if (!process.env.EVENT_REGISTRATIONS_TABLE_NAME) {
			return createResponse(500, { message: "EVENT_REGISTRATIONS_TABLE_NAME is not configured." }, origin);
		}

		if (!process.env.EVENTS_TABLE_NAME) {
			return createResponse(500, { message: "EVENTS_TABLE_NAME is not configured." }, origin);
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
				message: "club_account_id does not match the event registration.",
			}, origin);
		}

		const stored_event = await getItem(
			process.env.EVENTS_TABLE_NAME,
			{
				club_account_id,
				event_id,
			},
		) as StoredEvent | null;

		if (!stored_event) {
			return createResponse(404, { message: "Event not found." }, origin);
		}

		const configuredRegistrationTags = getEventRegistrationTags(stored_event);
		const tagResult = buildRegistrationTags(configuredRegistrationTags, registration_fields);
		if (tagResult.errors.length > 0) {
			return createResponse(400, {
				message: "Validation failed.",
				errors: tagResult.errors,
			}, origin);
		}

		await confirmEventRegistration(
			event_id,
			event_registration_id,
			tagResult.registration_tags,
		);

		return createResponse(200, {
			message: "Event registration confirmed.",
		}, origin);
	} catch (error: any) {
		console.error("confirm_registration error:", error);
		const message = error?.message || "Internal Server Error";
		const statusCode = error?.$metadata?.httpStatusCode || 500;
		return createResponse(statusCode, { message }, origin);
	}
};
