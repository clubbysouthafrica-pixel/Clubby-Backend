/**
 * Filter types for registration field filtering
 */

export interface RegistrationFieldFilter {
    field_id: string;
    type: string;
    input_type: string;
    value: string;
    condition?: string;
}

export interface FilterResult {
    matches: boolean;
    reason?: string;
}

/**
 * Filter a standard field against a filter
 * Handles text, select, and checkbox input types
 */
export const filterStandardField = (
    fieldValue: any,
    filter: RegistrationFieldFilter
): FilterResult => {
    if (!fieldValue) {
        return { matches: false, reason: "Field value is empty" };
    }

    const value = String(fieldValue).toLowerCase();
    const filterValue = String(filter.value).toLowerCase();

    if (filter.input_type === "text") {
        return {
            matches: value.includes(filterValue),
            reason: !value.includes(filterValue) ? `Text does not contain "${filter.value}"` : undefined
        };
    }

    if (filter.input_type === "select") {
        // For select fields, check exact match
        return {
            matches: value === filterValue,
            reason: value !== filterValue ? `Value "${fieldValue}" does not match "${filter.value}"` : undefined
        };
    }

    if (filter.input_type === "checkbox") {
        // For checkboxes, convert to boolean
        const fieldBool = fieldValue === true || value === "true";
        const filterBool = filter.value === "true";
        return {
            matches: fieldBool === filterBool,
            reason: fieldBool !== filterBool ? `Checkbox value does not match "${filter.value}"` : undefined
        };
    }

    return { matches: false, reason: "Unknown input type" };
};

/**
 * Filter a billing field against a filter
 * Handles select and dropdown types
 */
export const filterBillingField = (
    fieldValue: any,
    filter: RegistrationFieldFilter
): FilterResult => {
    if (!fieldValue) {
        return { matches: false, reason: "Field value is empty" };
    }

    const value = String(fieldValue).toLowerCase();
    const filterValue = String(filter.value).toLowerCase();

    if (filter.input_type === "select") {
        // For select fields, check exact match
        return {
            matches: value === filterValue,
            reason: value !== filterValue ? `Value "${fieldValue}" does not match "${filter.value}"` : undefined
        };
    }

    return { matches: false, reason: "Unknown input type" };
};

/**
 * Filter a billing number field against a filter
 * Supports conditions: eq, gte, lte, gt, lt, neq
 */
export const filterBillingNumberField = (
    fieldValue: any,
    filter: RegistrationFieldFilter
): FilterResult => {
    if (!fieldValue && fieldValue !== 0) {
        return { matches: false, reason: "Field value is empty" };
    }

    const numValue = Number(fieldValue);
    const filterNumValue = Number(filter.value);
    const condition = filter.condition || "eq";

    if (isNaN(numValue) || isNaN(filterNumValue)) {
        return { matches: false, reason: "Invalid number value" };
    }

    let matches = false;
    let reason = "";

    switch (condition) {
        case "eq":
            matches = numValue === filterNumValue;
            reason = !matches ? `${numValue} does not equal ${filterNumValue}` : "";
            break;
        case "gte":
            matches = numValue >= filterNumValue;
            reason = !matches ? `${numValue} is less than ${filterNumValue}` : "";
            break;
        case "lte":
            matches = numValue <= filterNumValue;
            reason = !matches ? `${numValue} is greater than ${filterNumValue}` : "";
            break;
        case "gt":
            matches = numValue > filterNumValue;
            reason = !matches ? `${numValue} is not greater than ${filterNumValue}` : "";
            break;
        case "lt":
            matches = numValue < filterNumValue;
            reason = !matches ? `${numValue} is not less than ${filterNumValue}` : "";
            break;
        case "neq":
            matches = numValue !== filterNumValue;
            reason = !matches ? `${numValue} equals ${filterNumValue}` : "";
            break;
        default:
            return { matches: false, reason: `Unknown condition: ${condition}` };
    }

    return { matches, reason: reason || undefined };
};

/**
 * Filter a club variable against a filter
 * Club variables are stored in registration.template_variables
 */
export const filterClubVariableField = (
    fieldValue: any,
    filter: RegistrationFieldFilter
): FilterResult => {
    if (!fieldValue) {
        return { matches: false, reason: "Field value is empty" };
    }

    const value = String(fieldValue).toLowerCase();
    const filterValue = String(filter.value).toLowerCase();

    return {
        matches: value.includes(filterValue),
        reason: !value.includes(filterValue) ? `Text does not contain "${filter.value}"` : undefined
    };
};

/**
 * Apply filters to registration data
 * Returns true if all filters match, false otherwise
 */
export const applyFiltersToRegistration = (
    registration: any,
    filters: RegistrationFieldFilter[]
): { matches: boolean; failedFilters?: string[] } => {
    if (!filters || filters.length === 0) {
        return { matches: true };
    }

    const failedFilters: string[] = [];

    for (const filter of filters) {
        let fieldValue: any;
        let filterResult: FilterResult;

        if (filter.type === "club_variable") {
            const templateVariable = registration?.template_variables?.find(
                (variable: any) => variable?.name === filter.field_id
            );

            if (!templateVariable) {
                failedFilters.push(`Field ${filter.field_id} not found in registration`);
                continue;
            }

            filterResult = filterClubVariableField(templateVariable.value, filter);

            if (!filterResult.matches) {
                failedFilters.push(
                    `${filter.field_id} (${filter.type}): ${filterResult.reason || "No match"}`
                );
            }

            continue;
        }

        const regField = Object.entries(registration).find(([key, val]: any) => {
            return key === filter.field_id;
        });

        if (!regField) {
            failedFilters.push(`Field ${filter.field_id} not found in registration`);
            continue;
        }

        if (filter.type === "billing") fieldValue = (regField[1] as any)?.label_value;
        else fieldValue = (regField[1] as any)?.value;

        if (filter.type === "standard") {
            filterResult = filterStandardField(fieldValue, filter);
        } else if (filter.type === "billing") {
            filterResult = filterBillingField(fieldValue, filter);
        } else if (filter.type === "billing:number") {
            filterResult = filterBillingNumberField(fieldValue, filter);
        } else {
            failedFilters.push(`Unknown filter type: ${filter.type}`);
            continue;
        }

        if (!filterResult.matches) {
            failedFilters.push(
                `${filter.field_id} (${filter.type}): ${filterResult.reason || "No match"}`
            );
        } else {
        }

    }

    return {
        matches: failedFilters.length === 0,
        failedFilters: failedFilters.length > 0 ? failedFilters : undefined
    };
};
