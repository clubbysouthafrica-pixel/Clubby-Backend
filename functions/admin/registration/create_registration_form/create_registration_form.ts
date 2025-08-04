import { createResponse, deconstructEvent, getItem, addItem, removeItem } from "./function_helpers";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | "NUMBER";
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export interface StandardField {
    field_name: string;
    id: string;
    input_type: StandardInputTypes;
    required: true | false;
    options?: string[];
}

export interface TextField {
    field_type: 'TEXT';
    field_name: string;
    id: string;
}

export interface BillingOption {
    label: string;
    amount: number;
    id: string;
}

export interface BillingField {
    field_name: string;
    id: string;
    input_type: 'TEXT' | 'DROPDOWN';
    placeholder?: string;
    required: boolean;
    currency: CurrencyType;
    amount?: number;
    billingOptions?: BillingOption[];
    field_type: 'BILLING';
}

function isBillingField(obj: any): obj is BillingField {
    const validCurrencies = ['ZAR', 'USD', 'GBP'];
    const isDropdown = obj.input_type === 'DROPDOWN' && Array.isArray(obj.billingOptions) && obj.billingOptions.every(
        (opt: any) => typeof opt.label === 'string' && typeof opt.amount === 'number' && typeof opt.id === 'string'
    );
    const isText = obj.input_type === 'TEXT' && typeof obj.amount === 'number';

    return typeof obj === 'object' &&
        obj.field_type === 'BILLING' &&
        typeof obj.field_name === 'string' &&
        typeof obj.id === 'string' &&
        validCurrencies.includes(obj.currency) &&
        typeof obj.required === 'boolean' &&
        (isDropdown || isText);
}

function isStandardField(obj: any): obj is StandardField {
    const validTypes = ['TEXT', 'DROPDOWN', 'PHONE', 'DATE', 'NUMBER'];
    return typeof obj === 'object' &&
        typeof obj.field_name === 'string' &&
        typeof obj.id === 'string' &&
        obj.field_type === 'STANDARD' &&
        typeof obj.required === 'boolean' &&
        validTypes.includes(obj.input_type) &&
        (obj.input_type !== 'DROPDOWN' || (Array.isArray(obj.options) && obj.options.every((o: any) => typeof o === 'string')));
}

function isTextField(obj: any): obj is TextField {
    return typeof obj === 'object' && 
        obj.field_type === 'TEXT' && 
        typeof obj.field_name === 'string' &&
        typeof obj.id === 'string'
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.club_account_id || !body?.fields) {
            return createResponse(400, { message: 'club_account_id and fields required.' }, origin);
        }

        if (body.deleteFields != null && (!Array.isArray(body.deleteFields) || !body.deleteFields.every((item: any) => typeof item === 'string'))) {
            return createResponse(400, { message: "deleteFields must be an array of strings if provided." }, origin);
        }

        if (!Array.isArray(body.fields)) {
            return createResponse(400, { message: "fields must be an array." }, origin);
        }

        const invalidFields = body.fields.filter((f: any) => !isStandardField(f) && !isBillingField(f) && !isTextField(f));
        if (invalidFields.length > 0) {
            return createResponse(400, {
                message: "Invalid fields detected.",
                invalidFields
            }, origin);
        }

        const fieldNames = body.fields
            .filter((f: any) => f.field_type !== 'TEXT')
            .map((f: any) => f.field_name);

        const duplicates = fieldNames.filter((name: string, index: number) => fieldNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            return createResponse(400, {
                message: "Duplicate field_name(s) in request. All STANDARD and BILLING field_name(s) must be unique for a club's registration form.",
                duplicates: [...new Set(duplicates)],
            }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        });
        if (club == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const club_admin = await getItem(process.env.CLUB_ADMIN_TABLE_NAME as string, {
            club_account_id: body.club_account_id,
            user_id: user_id as string,
        });
        if (club_admin == null) {
            return createResponse(400, { message: "User not associated with club." }, origin);
        }

        for (const field of body.fields) {
            const item: any = {
                club_account_id: body.club_account_id,
                id: field.id,
                field_name: field.field_name,
                field_type: field.field_type
            };

            if (isStandardField(field)) {
                item.input_type = field.input_type;
                item.required = field.required;

                if (field.input_type === 'DROPDOWN') {
                    item.options = field.options;
                }
            } else if (isBillingField(field)) {
                item.input_type = field.input_type;
                item.currency = field.currency;
                item.placeholder = field.placeholder;
                item.required = field.required;

                if (field.input_type === 'TEXT') {
                    item.amount = field.amount;
                } else if (field.input_type === 'DROPDOWN') {
                    item.billingOptions = field.billingOptions;
                }
            }

            await addItem(process.env.REGISTRATION_FORM_TABLE_NAME as string, item);
        }

        if (body.deleteFields) {
            for (const fieldName of body.deleteFields) {
                await removeItem(
                    process.env.REGISTRATION_FORM_TABLE_NAME as string,
                    {
                        club_account_id: body.club_account_id,
                        field_name: fieldName,
                    }
                );
            }
        }

        return createResponse(200, { message: "Fields successfully added." }, origin);

    } catch (error: any) {
        console.error('Error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};