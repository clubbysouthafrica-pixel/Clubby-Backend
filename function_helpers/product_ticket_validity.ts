type TicketProductType = "standard" | "ticket";

export type TicketValidityStorageFields = {
    valid_day_start_date: string;
    valid_day_end_date: string;
    excluded_valid_day_options: string[];
};

type TicketValidityResolution = {
    error?: string;
    fields: Partial<TicketValidityStorageFields>;
    removeAttributes: string[];
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const parseIsoDate = (value: string): Date | null => {
    const match = ISO_DATE_PATTERN.exec(value);
    if (!match) {
        return null;
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
};

const isValidIsoDate = (value: unknown): value is string => typeof value === "string" && parseIsoDate(value) !== null;

const sortAndDedupeIsoDates = (dates: string[]) => Array.from(new Set(dates)).sort((left, right) => left.localeCompare(right));

const enumerateDates = (startDate: string, endDate: string) => {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);

    if (!start || !end) {
        return [];
    }

    const dates: string[] = [];
    for (let currentTime = start.getTime(); currentTime <= end.getTime(); currentTime += MS_PER_DAY) {
        dates.push(new Date(currentTime).toISOString().slice(0, 10));
    }

    return dates;
};

const buildCompactFieldsFromExpandedDates = (validDayOptions: unknown): TicketValidityResolution => {
    if (!isStringArray(validDayOptions)) {
        return {
            error: "Invalid valid_day_options provided (Must be an array of strings).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (validDayOptions.some((date) => !isValidIsoDate(date))) {
        return {
            error: "Invalid valid_day_options provided (Must contain YYYY-MM-DD dates).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    const normalizedDates = sortAndDedupeIsoDates(validDayOptions);
    if (normalizedDates.length === 0) {
        return {
            error: "At least one valid date must remain for ticket products.",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    const valid_day_start_date = normalizedDates[0];
    const valid_day_end_date = normalizedDates[normalizedDates.length - 1];
    const includedDates = new Set(normalizedDates);
    const excluded_valid_day_options = enumerateDates(valid_day_start_date, valid_day_end_date).filter((date) => !includedDates.has(date));

    return {
        fields: {
            valid_day_start_date,
            valid_day_end_date,
            excluded_valid_day_options
        },
        removeAttributes: ["valid_day_options"]
    };
};

const buildCompactFieldsFromRange = (
    validDayStartDate: unknown,
    validDayEndDate: unknown,
    excludedValidDayOptions: unknown
): TicketValidityResolution => {
    if (validDayStartDate === undefined || validDayEndDate === undefined) {
        return {
            error: "valid_day_start_date and valid_day_end_date are both required for ticket products.",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (!isValidIsoDate(validDayStartDate)) {
        return {
            error: "Invalid valid_day_start_date provided (Must be YYYY-MM-DD).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (!isValidIsoDate(validDayEndDate)) {
        return {
            error: "Invalid valid_day_end_date provided (Must be YYYY-MM-DD).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (validDayStartDate.localeCompare(validDayEndDate) > 0) {
        return {
            error: "valid_day_start_date must be less than or equal to valid_day_end_date.",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (excludedValidDayOptions !== undefined && !isStringArray(excludedValidDayOptions)) {
        return {
            error: "Invalid excluded_valid_day_options provided (Must be an array of YYYY-MM-DD strings).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    const normalizedExcludedDates = sortAndDedupeIsoDates(excludedValidDayOptions ?? []);
    if (normalizedExcludedDates.some((date) => !isValidIsoDate(date))) {
        return {
            error: "Invalid excluded_valid_day_options provided (Must contain YYYY-MM-DD dates).",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    if (normalizedExcludedDates.some((date) => date.localeCompare(validDayStartDate) < 0 || date.localeCompare(validDayEndDate) > 0)) {
        return {
            error: "excluded_valid_day_options must fall within the valid day date range.",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    const totalDatesInRange = enumerateDates(validDayStartDate, validDayEndDate).length;
    if (totalDatesInRange - normalizedExcludedDates.length < 1) {
        return {
            error: "At least one valid date must remain for ticket products.",
            fields: {},
            removeAttributes: ["valid_day_options"]
        };
    }

    return {
        fields: {
            valid_day_start_date: validDayStartDate,
            valid_day_end_date: validDayEndDate,
            excluded_valid_day_options: normalizedExcludedDates
        },
        removeAttributes: ["valid_day_options"]
    };
};

export const resolveProductTicketValidityForStorage = (product: {
    product_type?: unknown;
    valid_day_options?: unknown;
    valid_day_start_date?: unknown;
    valid_day_end_date?: unknown;
    excluded_valid_day_options?: unknown;
}): TicketValidityResolution => {
    const hasCompactInput = product.valid_day_start_date !== undefined || product.valid_day_end_date !== undefined || product.excluded_valid_day_options !== undefined;
    const normalizedProductType: TicketProductType | undefined = product.product_type === "standard" || product.product_type === "ticket"
        ? product.product_type
        : undefined;

    if (normalizedProductType === "standard") {
        return {
            fields: {},
            removeAttributes: [
                "valid_day_options",
                "valid_day_start_date",
                "valid_day_end_date",
                "excluded_valid_day_options"
            ]
        };
    }

    if (hasCompactInput) {
        return buildCompactFieldsFromRange(
            product.valid_day_start_date,
            product.valid_day_end_date,
            product.excluded_valid_day_options
        );
    }

    if (product.valid_day_options !== undefined) {
        return buildCompactFieldsFromExpandedDates(product.valid_day_options);
    }

    return {
        fields: {},
        removeAttributes: []
    };
};

export const expandTicketValidityToDates = (ticketValidity: Partial<TicketValidityStorageFields>) => {
    if (!ticketValidity.valid_day_start_date || !ticketValidity.valid_day_end_date) {
        return [];
    }

    const excludedDates = new Set(ticketValidity.excluded_valid_day_options ?? []);
    return enumerateDates(ticketValidity.valid_day_start_date, ticketValidity.valid_day_end_date).filter((date) => !excludedDates.has(date));
};

export const normalizeProductTicketValidityForResponse = (product: Record<string, any>) => {
    const normalizedProductType: TicketProductType = product.product_type === "ticket" ? "ticket" : "standard";

    if (normalizedProductType !== "ticket") {
        return {
            ...product,
            product_type: "standard"
        };
    }

    const compactResolution = buildCompactFieldsFromRange(
        product.valid_day_start_date,
        product.valid_day_end_date,
        product.excluded_valid_day_options
    );

    const ticketFields = compactResolution.error
        ? buildCompactFieldsFromExpandedDates(product.valid_day_options).fields
        : compactResolution.fields;

    if (!ticketFields.valid_day_start_date || !ticketFields.valid_day_end_date) {
        return {
            ...product,
            product_type: "ticket",
            excluded_valid_day_options: []
        };
    }

    const normalizedTicketFields: TicketValidityStorageFields = {
        valid_day_start_date: ticketFields.valid_day_start_date,
        valid_day_end_date: ticketFields.valid_day_end_date,
        excluded_valid_day_options: sortAndDedupeIsoDates(ticketFields.excluded_valid_day_options ?? [])
    };

    return {
        ...product,
        product_type: "ticket",
        ...normalizedTicketFields
    };
};