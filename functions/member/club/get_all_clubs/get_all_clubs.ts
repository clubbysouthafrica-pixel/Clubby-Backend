import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const command = new ScanCommand({
            TableName: process.env.CLUB_TABLE_NAME,
        });
        const response = await dynamodbClient.send(command);

        let items: any[] = [];
        if (response.Items) {
            items = response.Items.map((item) => {
                const entry = unmarshall(item);
                return {
                    club_name: entry.club_name,
                    club_account_id: entry.club_account_id,
                    club_type: entry.club_type
                };
            });
        }

        return createResponse(200, { items }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
