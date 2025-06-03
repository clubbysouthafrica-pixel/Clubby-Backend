import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export type InputType = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE';
export type CurrencyType = 'DOLLAR' | 'RAND' | 'EURO' | 'POUND' | 'NEW ZEALAND DOLLAR' | 'AUSTRALIAN DOLLAR'

interface StandardField {
    field_type: string;
    field_name: string;
    type: InputType;
    options?: string[];
}

interface BillingField {
    field_type: string;
    field_name: string;
    currency: CurrencyType;
    amount: number;
}

type RegistrationForm = StandardField | BillingField;

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
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

        const items: RegistrationForm[] = [];
        response.Items?.forEach((item) => {

            const set = unmarshall(item);
            delete set.club_account_id;

            if (item.field_type.S === "STANDARD" && item.input_type.S === "DROPDOWN") {
                set["options"] = item.options.SS;
            }

            items.push(set as RegistrationForm);
        });

        return createResponse(200, { items }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
