import { DynamoDBClient, QueryCommandInput, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse, deconstructEvent } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);

    const { origin, body, query_string_params } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const command = new QueryCommand({
            TableName: process.env.CLUB_MEMBER_TABLE_NAME,
            IndexName: process.env.CLUB_ACCOUNT_ID_INDEX,
            KeyConditionExpression: "club_account_id = :clubId",
            ExpressionAttributeValues: {
                ":clubId": { S: query_string_params.club_account_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Items || response.Items.length === 0) {
            return createResponse(200, { registered: [], not_registered: [] }, origin);
        }

        const registered: any[] = []
        const unregistered: any[] = []

        response.Items.forEach(entry => {
            const item = unmarshall(entry)

            delete item.club_account_id

            if (item.registered) {
                registered.push(item)
            } else {
                unregistered.push(item)
            }
        })

        return createResponse(200, { registered, unregistered }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
