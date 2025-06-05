import { DynamoDBClient, QueryCommandInput, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.user_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const command = new QueryCommand({
            TableName: process.env.CLUB_MEMBER_TABLE_NAME,
            KeyConditionExpression: "club_account_id = :clubId",
            ExpressionAttributeValues: {
                ":clubId": { S: body.club_account_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Items || response.Items.length === 0) {
            return createResponse(200, { registered: [], not_registered: [] }, origin);
        }

        const registered: any[] = []
        const not_registered: any[] = []

        response.Items.forEach(entry => {
            const item = unmarshall(entry)

            delete item.user_id
            delete item.club_account_id

            if (entry.registered) {
                registered.push(entry)
            } else {
                not_registered.push(entry)
            }
        })

        return createResponse(200, { registered, not_registered }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
