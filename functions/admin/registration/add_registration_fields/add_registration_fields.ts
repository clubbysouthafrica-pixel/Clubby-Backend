import { createResponse, deconstructEvent, getItem, addItem } from "./function_helpers";

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR'

export interface StandardField {
    field_name: string;
    type: InputType;
    required: true | false;
    options?: string[];
}

export interface BillingField {
    field_name: string;
    currency: CurrencyType;
    amount: number;
}

function isStandardField(obj: any): obj is StandardField {
    const validTypes = ['TEXT', 'DROPDOWN', 'PHONE', 'DATE'];
    return typeof obj === 'object' &&
        typeof obj.field_name === 'string' &&
        typeof obj.required === 'boolean' &&
        validTypes.includes(obj.type) &&
        (obj.type !== 'DROPDOWN' || (Array.isArray(obj.options) && obj.options.every((o: any) => typeof o === 'string')));
}

function isBillingField(obj: any): obj is BillingField {
    const validCurrencies = [
        'DOLLAR',
        'RAND',
        'EURO',
        'POUND',
        'NEW ZEALAND DOLLAR',
        'AUSTRALIAN DOLLAR'
    ];
    return typeof obj === 'object' &&
        typeof obj.field_name === 'string' &&
        validCurrencies.includes(obj.currency) &&
        typeof obj.amount === 'number';
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body?.fields == null) {
            return createResponse(400, { message: 'club_account_id and fields required.' }, origin);
        }

        if (!Array.isArray(body.fields)) {
            return createResponse(400, { message: "fields must be an array." }, origin);
        }

        const invalidFields = body.fields.filter(
            (f: any) => !isStandardField(f) && !isBillingField(f)
        );

        if (invalidFields.length > 0) {
            return createResponse(400, {
                message: "Invalid fields detected. Attributes required for 'STANDARD' field: field_name, type, required. Attributes requird for 'BILLING' field: field_name, currency, amount.",
                invalidFields
            }, origin);
        }

        const fieldNames = body.fields.map((f: any) => f.field_name);

        const duplicates = fieldNames.filter((name: string, index: string) => fieldNames.indexOf(name) !== index);

        if (duplicates.length > 0) {
            return createResponse(400, {
                message: "Duplicate field_name(s) in request. All field_name(s) must be unique for a clubs registration form.",
                duplicates: [...new Set(duplicates)],
            }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        })

        if (club == null) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        for (const field of body.fields) {
            const item: any = {
                club_account_id: body.club_account_id ,
                field_name: field.field_name
            };

            if (isStandardField(field)) {
                item.field_type = 'STANDARD';
                item.input_type = field.type;
                item.required = field.required;
                if (field.type === 'DROPDOWN' && field.options) {
                    item.options = field.options;
                }
            } else if (isBillingField(field)) {
                item.field_type = 'BILLING';
                item.currency = field.currency;
                item.amount = field.amount;
            }

            await addItem(
                process.env.REGISTRATION_FORM_TABLE_NAME as string,
                item
            )
        }

        return createResponse(200, { message: "Fields successfully added." }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
