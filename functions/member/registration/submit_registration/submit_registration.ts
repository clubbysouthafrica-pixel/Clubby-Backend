import {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand,
    QueryCommand,
    QueryCommandInput
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR';

interface StandardField {
    field_type: "STANDARD";
    field_name: string;
    required: boolean;
    type: InputType;
    options?: string[];
}

interface BillingField {
    field_type: "BILLING";
    field_name: string;
    currency: CurrencyType;
    amount: number;
}

function validateRequestBody(body: any) {
    if (!body?.club_account_id || !body?.user_id || !body?.billing_field || !body?.standard_fields) {
        return 'club_account_id, user_id, billing_field and standard_fields required.';
    }

    if (typeof body.billing_field !== 'object') {
        return 'billing_field is required to be an object.';
    }

    if (!Array.isArray(body.standard_fields) || body.standard_fields.length === 0) {
        return 'standard_fields is required to be an array containing objects.';
    }

    const { billing_type, amount } = body.billing_field;
    if (!billing_type || amount == null) {
        return 'billing_type and amount is required in each billing_field object.';
    }

    if (typeof billing_type !== 'string' || typeof amount !== 'number') {
        return 'Each billing_field object requires billing_type to be STRING and amount to be NUMBER.';
    }

    for (const field of body.standard_fields) {
        if (typeof field !== 'object') return 'All standard_field indexes must be objects.';
        if (!field.name || !field.value || typeof field.name !== 'string' || typeof field.value !== 'string') {
            return 'All standard_fields must have STRING keys: name and value.';
        }
    }

    return null;
}

function validateBillingField(billingFields: BillingField[], userBillingField: { billing_type: string, amount: number }): boolean {
    return billingFields.some(
        (field) =>
            field.field_name === userBillingField.billing_type &&
            field.amount === userBillingField.amount
    );
}

function validateStandardFields(standardFields: StandardField[], submittedFields: { name: string; value: string }[]): string | null {
    
    const requiredFields = standardFields.filter(f => f.required);
    const fieldNames = submittedFields.map(f => f.name);
    const allValid = requiredFields.every(req => {
        if (!fieldNames.includes(req.field_name)) {
            return false;
        }
        return true;
    });

    if (!allValid) {
        const missingField = requiredFields.find(req => !fieldNames.includes(req.field_name));
        return `The following required field is missing: ${missingField?.field_name}.`;
    }

    const knownFieldNames = standardFields.map(f => f.field_name);
    for (const field of submittedFields) {
        if (!knownFieldNames.includes(field.name)) {
            return `The following provided field does not exist in this club's registration form: ${field.name}.`;
        }
    }

    return null;
}

export const handler = async (event: any) => {
    const origin = event.headers.origin;

    try {
        const body = JSON.parse(event.body);
        const validationMessage = validateRequestBody(body);

        const userCommand = new GetItemCommand({
            TableName: process.env.USERS_TABLE_NAME,
            Key: {
                user_type: { S: "MEMBER" },
                user_id: { S: body.user_id }
            }
        });
        const userResponse = await dynamodbClient.send(userCommand);
        if (!userResponse.Item) {
            return createResponse(200, { message: "user_id is invalid." }, origin);
        }

        if (validationMessage) {
            return createResponse(400, { message: validationMessage }, origin);
        }

        const queryParams: QueryCommandInput = {
            TableName: process.env.REGISTRATION_FORM_TABLE_NAME,
            KeyConditionExpression: "club_account_id = :clubId",
            ExpressionAttributeValues: {
                ":clubId": { S: body.club_account_id }
            }
        };

        const response = await dynamodbClient.send(new QueryCommand(queryParams));
        if (!response.Items || response.Items.length === 0) {
            return createResponse(400, { message: `Registration form does not exist for club: ${body.club_account_id}.` }, origin);
        }

        const billingFields: BillingField[] = [];
        const standardFields: StandardField[] = [];

        response.Items.forEach(item => {
            const field = unmarshall(item) as BillingField | StandardField;
            if (field.field_type === 'BILLING') billingFields.push(field as BillingField);
            else standardFields.push(field as StandardField);
        });

        if (!validateBillingField(billingFields, body.billing_field)) {
            return createResponse(400, {
                message: `Invalid billing field entered. Valid billing types: ${JSON.stringify(billingFields.reduce((acc: Record<string, number>, field: { field_name: string; amount: number }) => {
                    acc[field.field_name] =  field.amount;
                    return acc;
                }, {}))}`
            }, origin);
        }

        const standardFieldValidation = validateStandardFields(standardFields, body.standard_fields);
        if (standardFieldValidation) {
            return createResponse(400, { message: standardFieldValidation }, origin);
        }

        const item = {
            club_account_id: { S: body.club_account_id },
            user_id: { S: body.user_id },
            registered: { BOOL: false },
            outstanding_amount: { N: body.billing_field.amount.toString() },
            ...body.standard_fields.reduce((acc: Record<string, { S: string }>, field: { name: string; value: string }) => {
                acc[field.name] = { S: field.value };
                return acc;
            }, {})
        };

        const clubMemberCommand = new PutItemCommand({
            TableName: process.env.CLUB_MEMBER_TABLE_NAME,
            Item: item
        });

        const clubMemberResponse = await dynamodbClient.send(clubMemberCommand);
        console.log('Member registration submitted successfully: ', clubMemberResponse);

        return createResponse(200, { message: "Success" }, origin);

    } catch (error: any) {
        console.error('Submit registration error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
