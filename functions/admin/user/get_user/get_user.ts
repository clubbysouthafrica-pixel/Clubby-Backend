import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

const allowedOrigins = [
    "http://localhost:5173"
];

const createResponse = (statusCode: number, data: object, origin: string) => {
    const allowOrigin = allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];

    const response = {
        statusCode: statusCode,
        body: JSON.stringify(data),
        headers: {
            "Access-Control-Allow-Origin": allowOrigin,
            "Access-Control-Allow-Methods": "GET,POST",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    };
    console.log(`RESPONSE @ ${new Date()}: `, response);
    return response;
};

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.user_id == null) {
            return createResponse(400, { message: "User ID required." }, origin);
        }

        const command = new GetItemCommand({
            TableName: process.env.USERS_TABLE_NAME,
            Key: {
                user_type: { S: process.env.USER_TYPE as string },
                user_id: { S: body.user_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Item) {
            return createResponse(200, { message: "User not found" }, origin);
        }

        const item = unmarshall(response.Item);

        return createResponse(200, { data: item }, origin);
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
