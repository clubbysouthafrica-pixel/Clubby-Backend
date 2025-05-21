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
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Headers": "Content-Type,X-Requested-With,Authorization",
            "Access-Control-Allow-Credentials": "true"
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

        if (body?.club_name == null || body?.club_account_id == null) {
            return createResponse(400, { message: "club_name and club_account_id required." }, origin);
        }

        const command = new GetItemCommand({
            TableName: process.env.CLUB_ACCOUNT_TABLE_NAME,
            Key: {
                club_name: { S: body.club_name },
                club_account_id: { S: body.club_account_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Item) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        const item = unmarshall(response.Item);

        return createResponse(200, {
            club_name: item["club_name"],
            club_account_id: item["club_account_id"],
            club_type: item["club_type"]
        }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
