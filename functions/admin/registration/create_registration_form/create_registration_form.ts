import { createResponse, deconstructEvent, getItem, addItem, removeItem } from "./function_helpers";

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export interface StandardField {
    field_name: string;
    id: string;
    input_type: InputType;
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
        typeof obj.id === 'string' &&
        typeof obj.required === 'boolean' &&
        validTypes.includes(obj.input_type) &&
        (obj.input_type !== 'DROPDOWN' || (Array.isArray(obj.options) && obj.options.every((o: any) => typeof o === 'string')));
}

function isBillingField(obj: any): obj is BillingField {
    const validCurrencies = ['ZAR', 'USD', 'GBP'];
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

        if (body?.deleteFields != null && (!Array.isArray(body.deleteFields) || !body.deleteFields.every((item: any) => typeof item === 'string'))) {
            return createResponse(400, { message: "deleteFields must be an array of strings if provided." }, origin);
        }

        if (!Array.isArray(body.fields)) {
            return createResponse(400, { message: "fields must be an array." }, origin);
        }

        const invalidFields = body.fields.filter(
            (f: any) => !isStandardField(f) && !isBillingField(f)
        );

        if (invalidFields.length > 0) {
            return createResponse(400, {
                message: "Invalid fields detected. Attributes required for 'STANDARD' field: field_name, input_type, required, id. Attributes requird for 'BILLING' field: field_name, currency, amount.",
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
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const club_admin = await getItem(
            process.env.CLUB_ADMIN_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                user_id: user_id as string,
            }
        )
        if (club_admin == null) {
            return createResponse(400, { message: "User not associated with club." }, origin);
        }

        for (const field of body.fields) {
            const item: any = {
                club_account_id: body.club_account_id,
                field_name: field.field_name
            };

            if (isStandardField(field)) {
                item.field_type = 'STANDARD';
                item.input_type = field.input_type;
                item.id = field.id;
                item.required = field.required;
                if (field.input_type === 'DROPDOWN' && field.options) {
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

        if (body.deleteFields) {
            for (const fieldName of body.deleteFields) {
                await removeItem(
                    process.env.REGISTRATION_FORM_TABLE_NAME as string,
                    {
                        club_account_id: body.club_account_id,
                        field_name: fieldName as string,
                    }
                )
            }
        }

        return createResponse(200, { message: "Fields successfully added." }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
