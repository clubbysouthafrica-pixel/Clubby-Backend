import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.club_account_id == null || body?.user_id == null) {
            return createResponse(400, { message: "club_account_id and user_id required." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.user_id !== 'string') {
            return createResponse(400, { message: "club_account_id and user_id must be STRING types." }, origin);
        }

        const command = new GetItemCommand({
            TableName: process.env.CLUB_MEMBER_TABLE_NAME,
            Key: {
                club_account_id: { S: body.club_account_id },
                user_id: { S: body.user_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Item) {
            return createResponse(400, { message: "User not found." }, origin);
        }

        const item = unmarshall(response.Item);

        delete item.user_id
        delete item.club_account_id

        return createResponse(200, { ...item }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
