import { createResponse, deconstructEvent, getItem, addItem, removeItem } from "./function_helpers";
import { randomUUID } from 'crypto';
import { objectToCloudFormation } from "aws-cdk-lib";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export interface StandardField {
    field_id?: string;
    field_name: string;
    id: string;
    input_type: StandardInputTypes;
    required: true | false;
    field_text: string;
    options?: string[];
}

export interface TextField {
    field_id?: string;
    field_type: 'TEXT';
    input_type: 'CHECKBOX' | 'DISPLAY';
    text: string;
    id: string;
}

export interface BillingOption {
    label: string;
    amount: number;
    id: string;
}

export interface BillingField {
    field_id?: string;
    field_name: string;
    id: string;
    input_type: 'TEXT' | 'DROPDOWN';
    placeholder?: string;
    required: boolean;
    field_text: string;
    currency: CurrencyType;
    amount?: number;
    billingOptions?: BillingOption[];
    field_type: 'BILLING';
}

function isBillingField(obj: any): obj is BillingField {
    const validCurrencies = ['ZAR', 'USD', 'GBP'];
    const isDropdown = obj.input_type === 'DROPDOWN' && Array.isArray(obj.billingOptions) && obj.billingOptions.every(
        (opt: any) => typeof opt.label === 'string' && typeof opt.amount === 'number' && typeof opt.option_order_id === 'string'
    );
    const isText = obj.input_type === 'TEXT' && typeof obj.amount === 'number';

    return obj.field_type === 'BILLING' &&
        validCurrencies.includes(obj.currency) &&
        (isDropdown || isText) &&
        typeof obj === 'object' &&
        typeof obj.field_text === 'string' &&
        typeof obj.field_name === 'string' &&
        typeof obj.field_order_id === 'string' &&
        typeof obj.required === 'boolean'
}

function isStandardField(obj: any): obj is StandardField {
    const validTypes = ['TEXT', 'DROPDOWN', 'PHONE', 'DATE', 'NUMBER', 'RADIO'];

    return obj.field_type === 'STANDARD' &&
        validTypes.includes(obj.input_type) &&
        (obj.input_type !== 'DROPDOWN' || (Array.isArray(obj.options) && obj.options.every((o: any) => typeof o === 'string'))) &&
        typeof obj === 'object' &&
        typeof obj.field_text === 'string' &&
        typeof obj.field_name === 'string' &&
        typeof obj.field_order_id === 'string' &&
        typeof obj.required === 'boolean'
}

function isTextField(obj: any): obj is TextField {
    return obj.field_type === 'TEXT' &&
        (obj.input_type === 'CHECKBOX' || obj.input_type === 'DISPLAY') &&
        typeof obj === 'object' &&
        typeof obj.field_order_id === 'string' &&
        typeof obj.field_text === 'string'
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.club_account_id || !body?.pages) {
            return createResponse(400, { message: 'club_account_id and pages required.' }, origin);
        }

        if (!Array.isArray(body.pages)) {
            return createResponse(400, { message: "pages must be an array." }, origin);
        }

        if (
            body.deleteFields != null &&
            (!Array.isArray(body.deleteFields) ||
                !body.deleteFields.every((item: any) => typeof item === 'string'))
        ) {
            return createResponse(400, { message: "deleteFields must be an array of strings if provided." }, origin);
        }

        const allFields = body.pages.flatMap((page: any) => {
            if (typeof page.page_index !== 'number' || typeof page.page_header !== 'string') {
                throw new Error("Each page must have a valid page_index (number) and page_header (string).");
            }
            if (!Array.isArray(page.fields)) {
                throw new Error("Each page must have a fields array.");
            }

            return page.fields.map((field: any) => ({
                ...field,
                page_index: page.page_index,
                page_header: page.page_header
            }));
        });

        const invalidFields = allFields.filter(
            (f: any) => !isStandardField(f) && !isBillingField(f) && !isTextField(f)
        );
        if (invalidFields.length > 0) {
            return createResponse(400, { message: "Invalid fields detected.", invalidFields }, origin);
        }

        const fieldNames = allFields
            .filter((f: any) => f.field_type !== 'TEXT')
            .map((f: any) => f.field_name);

        const duplicates = fieldNames.filter(
            (name: string, index: number) => fieldNames.indexOf(name) !== index
        );
        if (duplicates.length > 0) {
            return createResponse(400, {
                message: "Duplicate field names. All STANDARD and BILLING field names must be unique.",
                duplicates: [...new Set(duplicates)]
            }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        });
        if (!club) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const club_admin = await getItem(process.env.CLUB_ADMIN_TABLE_NAME as string, {
            club_account_id: body.club_account_id,
            user_id: user_id as string,
        });
        if (!club_admin) {
            return createResponse(400, { message: "User not associated with club." }, origin);
        }

        for (const field of allFields) {
            const item: any = {
                field_id: field?.field_id ?? randomUUID(),
                club_account_id: body.club_account_id,
                page_index: field.page_index,
                page_header: field.page_header,
                field_order_id: field.field_order_id,
                field_type: field.field_type,
                field_text: field.field_text
            };

            if (isStandardField(field)) {
                item.input_type = field.input_type;
                item.required = field.required;
                item.field_name = field.field_name;
                if (field.input_type === 'DROPDOWN') {
                    item.options = field.options;
                }
            } else if (isBillingField(field)) {
                item.input_type = field.input_type;
                item.currency = field.currency;
                item.placeholder = field.placeholder;
                item.required = field.required;
                item.field_name = field.field_name;
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
                await removeItem(process.env.REGISTRATION_FORM_TABLE_NAME as string, {
                    club_account_id: body.club_account_id,
                    field_name: fieldName
                });
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