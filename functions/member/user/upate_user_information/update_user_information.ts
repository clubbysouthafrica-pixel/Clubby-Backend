import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        console.log('BODY: ', body)

        return createResponse(200, { message: "Success" }, origin);
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
