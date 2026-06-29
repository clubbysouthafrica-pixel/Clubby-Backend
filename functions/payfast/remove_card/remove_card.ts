import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    const { origin, body } = deconstructEvent(event);

    try {
        const club_account_id = body?.club_account_id as string | undefined;

        if (!club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        const command = new UpdateItemCommand({
            TableName: process.env.CLUB_TABLE_NAME as string,
            Key: marshall({ club_account_id }),
            UpdateExpression: "REMOVE #payfast_token",
            ExpressionAttributeNames: {
                "#payfast_token": "payfast_token",
            },
        });

        await dynamodbClient.send(command);

        return createResponse(200, { message: "Card removed successfully." }, origin);
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: (error as Error).message }, origin);
    }
};
