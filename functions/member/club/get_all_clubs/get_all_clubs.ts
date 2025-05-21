import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
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
        const command = new ScanCommand({
            TableName: process.env.CLUB_ACCOUNT_TABLE_NAME,
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
