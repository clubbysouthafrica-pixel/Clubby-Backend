import {
    createResponse,
    deconstructEvent,
    queryItems,
    queryItemsWithPagination,
} from "./function_helpers";

interface FieldFilter {
    field_id?: string;
    value?: string;
}

interface EventRegistrationFilters {
    payment_status?: string;
    pricing_option_id?: string;
    pricing_option_ids?: string[];
    field_filters?: FieldFilter[];
}

interface EventRegistrationFilterRequestBody {
    filters?: EventRegistrationFilters;
}

const normalizeFilterValue = (value: unknown) => {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
};

const getNormalizedFieldFilters = (filters: EventRegistrationFilters): FieldFilter[] => {
    if (!Array.isArray(filters.field_filters)) {
        return [];
    }

    return filters.field_filters.filter((filter) => {
        return Boolean(
            filter
            && typeof filter.field_id === "string"
            && filter.field_id.trim()
            && typeof filter.value === "string"
            && filter.value.trim(),
        );
    }).map((filter) => ({
        field_id: filter.field_id?.trim(),
        value: filter.value?.trim(),
    }));
};

const validateFilters = (filters: EventRegistrationFilters): string[] => {
    const errors: string[] = [];

    if (filters.payment_status !== undefined && typeof filters.payment_status !== "string") {
        errors.push("payment_status must be a string when provided.");
    }

    if (filters.pricing_option_id !== undefined && typeof filters.pricing_option_id !== "string") {
        errors.push("pricing_option_id must be a string when provided.");
    }

    if (filters.pricing_option_ids !== undefined && !Array.isArray(filters.pricing_option_ids)) {
        errors.push("pricing_option_ids must be an array when provided.");
    }

    if (Array.isArray(filters.pricing_option_ids)) {
        filters.pricing_option_ids.forEach((pricingOptionId, index) => {
            if (typeof pricingOptionId !== "string" || !pricingOptionId.trim()) {
                errors.push(`pricing_option_ids[${index}] must be a non-empty string.`);
            }
        });
    }

    if (filters.field_filters !== undefined && !Array.isArray(filters.field_filters)) {
        errors.push("field_filters must be an array when provided.");
    }

    if (Array.isArray(filters.field_filters)) {
        filters.field_filters.forEach((fieldFilter, index) => {
            const prefix = `field_filters[${index}]`;

            if (!fieldFilter || typeof fieldFilter !== "object") {
                errors.push(`${prefix} must be an object.`);
                return;
            }

            if (typeof fieldFilter.field_id !== "string" || !fieldFilter.field_id.trim()) {
                errors.push(`${prefix}.field_id is required.`);
            }

            if (typeof fieldFilter.value !== "string" || !fieldFilter.value.trim()) {
                errors.push(`${prefix}.value is required.`);
            }
        });
    }

    return errors;
};

const getRequestFilters = (body: unknown): EventRegistrationFilters => {
    if (!body || typeof body !== "object") {
        return {};
    }

    const typedBody = body as EventRegistrationFilterRequestBody & EventRegistrationFilters;

    if (typedBody.filters && typeof typedBody.filters === "object") {
        return typedBody.filters;
    }

    return typedBody;
};

const applyEventRegistrationFilters = (
    event_registration: Record<string, any>,
    filters: EventRegistrationFilters,
): boolean => {
    const normalizedPaymentStatus = normalizeFilterValue(filters.payment_status);
    if (normalizedPaymentStatus && normalizedPaymentStatus !== "all") {
        const paymentStatus = normalizeFilterValue(event_registration.payment_status);
        if (paymentStatus !== normalizedPaymentStatus) {
            return false;
        }

        if (normalizedPaymentStatus === "paid") {
            const amountPaid = typeof event_registration.amount_paid === "number"
                ? event_registration.amount_paid
                : Number(event_registration.amount_paid);
            const entryFeeAmount = typeof event_registration.entry_fee_amount === "number"
                ? event_registration.entry_fee_amount
                : Number(event_registration.entry_fee_amount);

            if (!Number.isFinite(amountPaid) || !Number.isFinite(entryFeeAmount) || amountPaid !== entryFeeAmount) {
                return false;
            }
        }
    }

    const requestedPricingOptionIds = Array.isArray(filters.pricing_option_ids)
        ? filters.pricing_option_ids
            .filter((pricingOptionId): pricingOptionId is string => typeof pricingOptionId === "string")
            .map((pricingOptionId) => pricingOptionId.trim())
            .filter((pricingOptionId) => pricingOptionId && pricingOptionId !== "all")
        : [];
    const pricingOptionId = typeof filters.pricing_option_id === "string"
        ? filters.pricing_option_id.trim()
        : "";
    const effectivePricingOptionIds = requestedPricingOptionIds.length > 0
        ? requestedPricingOptionIds
        : pricingOptionId && pricingOptionId !== "all"
            ? [pricingOptionId]
            : [];

    if (effectivePricingOptionIds.length > 0) {
        const selectedPricingOptionIds = Array.isArray(event_registration.selected_pricing_option_ids)
            ? event_registration.selected_pricing_option_ids
            : [];

        const hasAllPricingOptions = effectivePricingOptionIds.every((requestedPricingOptionId) =>
            selectedPricingOptionIds.includes(requestedPricingOptionId)
        );

        if (!hasAllPricingOptions) {
            return false;
        }
    }

    const fieldFilters = getNormalizedFieldFilters(filters);
    if (fieldFilters.length > 0) {
        const registrationFields = Array.isArray(event_registration.registration_fields)
            ? event_registration.registration_fields
            : [];

        for (const fieldFilter of fieldFilters) {
            const matchingField = registrationFields.find((field: Record<string, any>) => {
                const fieldId = typeof field?.field_id === "string" ? field.field_id.trim() : "";
                const fieldValue = typeof field?.value === "string" ? field.value.trim().toLowerCase() : "";

                return fieldId === fieldFilter.field_id && fieldValue === fieldFilter.value?.toLowerCase();
            });

            if (!matchingField) {
                return false;
            }
        }
    }

    return true;
};

const EVENT_REGISTRATION_FIELDS_TO_REMOVE = new Set([
    "club_account_id",
    "registration_fields",
    "selected_pricing_option_ids"
]);

const sanitizeEventRegistration = (event_registration: Record<string, any>) => {
    return Object.fromEntries(
        Object.entries(event_registration).filter(([key]) => !EVENT_REGISTRATION_FIELDS_TO_REMOVE.has(key))
    );
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!query_string_params.club_account_id) {
            return createResponse(400, { message: "Club Account ID query parameter is required" }, origin);
        }

        const filters = getRequestFilters(body);
        const filterErrors = validateFilters(filters);
        if (filterErrors.length > 0) {
            return createResponse(400, {
                message: "Validation failed.",
                errors: filterErrors,
            }, origin);
        }

        const events = await queryItems(
            process.env.EVENTS_TABLE_NAME as string,
            "club_account_id = :club_account_id",
            {
                ":club_account_id": query_string_params.club_account_id
            }
        );

        if (!events || events.length === 0) {
            return createResponse(200, { event_registrations: [], eventsFilters: [], chosen_event: null }, origin);
        }

        let chosen_event = null;
        if (!query_string_params.event_id) {
            chosen_event = events[0];
        } else {
            chosen_event = events.find((event: any) => event.event_id === query_string_params.event_id);

            if (!chosen_event) {
                return createResponse(404, { message: "Event not found." }, origin);
            }
        }

        const eventsFilters = [];
        for (const event of events ?? []) {
            eventsFilters.push({
                event_id: event.event_id,
                event_name: event.title,
            });
        }

        const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
        const previousToken = query_string_params?.pageToken
            ? JSON.parse(decodeURIComponent(query_string_params.pageToken))
            : undefined;

        const event_registrations: Record<string, any>[] = [];
        let currentToken = previousToken;
        let lastEvaluatedKey: any = undefined;

        while (true) {
            const queryResult = await queryItemsWithPagination(
                process.env.EVENT_REGISTRATIONS_TABLE_NAME!,
                "event_id = :event_id",
                {
                    ":event_id": chosen_event.event_id
                },
                undefined,
                true,
                limit ? limit - event_registrations.length : undefined,
                currentToken,
            );

            const queriedRegistrations = queryResult.items;
            const queryLastEvaluatedKey = queryResult.lastEvaluatedKey;

            if (!queriedRegistrations || queriedRegistrations.length === 0) {
                lastEvaluatedKey = undefined;
                break;
            }

            const filteredRegistrations = queriedRegistrations.filter((event_registration: Record<string, any>) =>
                applyEventRegistrationFilters(event_registration, filters)
            );

            let lastAddedRegistration: Record<string, any> | undefined;
            for (const event_registration of filteredRegistrations) {
                event_registrations.push(event_registration);
                lastAddedRegistration = event_registration;

                if (limit && event_registrations.length >= limit) {
                    break;
                }
            }

            if (limit && event_registrations.length >= limit && lastAddedRegistration) {
                lastEvaluatedKey = {
                    event_id: { "S": lastAddedRegistration.event_id },
                    event_registration_id: { "S": lastAddedRegistration.event_registration_id },
                };
                break;
            }

            if (!queryLastEvaluatedKey) {
                lastEvaluatedKey = undefined;
                break;
            }

            currentToken = queryLastEvaluatedKey;
        }

        if (!event_registrations || event_registrations.length === 0) {
            return createResponse(200, { event_registrations: [], eventsFilters, chosen_event }, origin);
        }

        const sanitized_event_registrations = event_registrations.map((event_registration: Record<string, any>) =>
            sanitizeEventRegistration(event_registration)
        );

        const response: Record<string, any> = {
            event_registrations: sanitized_event_registrations,
            eventsFilters,
            chosen_event,
        };

        if (lastEvaluatedKey) {
            response.pageToken = encodeURIComponent(JSON.stringify(lastEvaluatedKey));
        }

        return createResponse(200, response, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};