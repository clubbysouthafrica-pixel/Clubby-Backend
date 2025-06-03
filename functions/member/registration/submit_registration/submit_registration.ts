import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR'

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

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);
        console.log('BODY: ', body)

        if (body?.club_account_id == null || body?.billing_field == null || body?.standard_fields == null) {
            return createResponse(400, { message: 'club_account_id, billing_field and standard_fields required.' }, origin);
        }

        if (typeof body.billing_field !== 'object') {
            return createResponse(400, { message: 'billing_field is required to be an object.' }, origin);
        }
        if (!Array.isArray(body.standard_fields)) {
            return createResponse(400, { message: 'standard_fields is required to be an array.' }, origin);
        }

        if (body.billing_field.billing_type == null || body.billing_field.amount == null) {
            return createResponse(400, { message: 'billing_type and amount is required in billing_field object.' }, origin);
        }
        if (typeof body.billing_field.billing_type !== 'string' || typeof body.billing_field.amount !== 'number') {
            return createResponse(400, { message: 'billing_field object required billing_type to be STRING type and amount to be NUMBER type.' }, origin);
        }

        let invalid_standard_field_array = false;
        let invalid_standard_field_object = false;
        body.standard_fields.forEach((field: {name: string, value: string}) => {
            if (typeof field !== 'object') {
                invalid_standard_field_array = true
            }

            if (field.name == null || field.value == null || typeof field.name !== 'string' || typeof field.value !== 'string') {
                invalid_standard_field_object = true
            }
        })
        if (invalid_standard_field_array) {
            return createResponse(400, { message: 'All standard_field indexes are required to be an object.' }, origin);
        }
        if (invalid_standard_field_object) {
            return createResponse(400, { message: 'All standard_fields objects require the following STRING type keys: name and value.' }, origin);
        }

        const params: QueryCommandInput = {
            TableName: process.env.REGISTRATION_FORM_TABLE_NAME,
            KeyConditionExpression: "club_account_id = :clubId",
            ExpressionAttributeValues: {
                ":clubId": { S: body.club_account_id },
            },
        };

        const response = await dynamodbClient.send(new QueryCommand(params));

        if (!response.Items || response.Items.length === 0) {
            return createResponse(400, { message: `Registration form does not exist for club: ${body.club_account_id}.` }, origin);
        }

        const BILLING_FIELDS: BillingField[]  = [];
        const STANDARD_FIELFS: StandardField[] = [];

        response.Items?.forEach((item) => {
            const set = unmarshall(item) as BillingField | StandardField;
            if (set.field_type == "BILLING") {
                BILLING_FIELDS.push(set)
            } else {
                STANDARD_FIELFS.push(set)
            }
        });

        let invalid_billing_field = true
        BILLING_FIELDS.forEach(billing_field => {
            if (billing_field.field_name === body.billing_field.type && billing_field.amount === body.billing_field.amount) {
                invalid_billing_field = false;
            }
        });
        if (invalid_billing_field) {
            return createResponse(400, { message: `Invalid billing field entered. Valid billing types: ${BILLING_FIELDS}` }, origin);
        }

        let valid_standard_field = true
        let invalid_standard_object = {}
        STANDARD_FIELFS.forEach(standard_field => {

            let standard_field_not_found = true
            if (standard_field.required) {
                body.standard_fields.forEach((field: {name: string, value: string}) => {
                    if (field.name === standard_field.field_name) {
                        standard_field_not_found = false
                    }
                })
            }

            if (standard_field_not_found) {
                valid_standard_field = false
                invalid_standard_object = standard_field;
            }
        })

        if (!valid_standard_field) {
            return createResponse(400, { message: `The following standard_fields index is invalid: ${invalid_standard_object}.` }, origin);
        }

        return createResponse(200, { message: `Success` }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
