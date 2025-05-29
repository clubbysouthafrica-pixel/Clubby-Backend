import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export type FieldType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR'

export interface StandardField {
    field_name: string;
    type: FieldType;
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
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

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
                message: "Invalid fields detected.",
                invalidFields
            }, origin);
        }

        const fieldNames = body.fields.map((f: any) => f.field_name);

        const duplicates = fieldNames.filter((name: string, index: string) => fieldNames.indexOf(name) !== index);

        if (duplicates.length > 0) {
            return createResponse(400, {
                message: "Duplicate field_name(s) in request.",
                duplicates: [...new Set(duplicates)],
            }, origin);
        }

        const clubCommand = new GetItemCommand({
            TableName: process.env.CLUB_TABLE_NAME,
            Key: {
                club_account_id: { S: body.club_account_id }
            }
        });
        const clubResponse = await dynamodbClient.send(clubCommand);
        if (!clubResponse.Item) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        for (const field of body.fields) {
            const item: any = {
                PK: { S: body.club_account_id },
                SK: { S: field.field_name }
            };

            if (isStandardField(field)) {
                item.type = { S: field.type };
                item.value = { S: field.type === 'DROPDOWN' ? (field.options?.[0] || '') : '' };
                if (field.type === 'DROPDOWN' && field.options) {
                    item.options = { SS: field.options };
                }
            } else if (isBillingField(field)) {
                item.currency = { S: field.currency };
                item.amount = { N: field.amount.toString() };
            }

            const putCommand = new PutItemCommand({
                TableName: process.env.REGISTRATION_FORM_TABLE_NAME,
                Item: item
            });

            await dynamodbClient.send(putCommand);
        }

        return createResponse(200, { message: "Fields successfully added." }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
