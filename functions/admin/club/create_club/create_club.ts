import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse, CLUB_TYPES } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

function generate_club_Id(club_name: string): string {
    return `club_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (body?.club_type == null || body?.club_name == null) {
            return createResponse(400, { message: 'club_type and club_name required.' }, origin);
        }

        if (!CLUB_TYPES.includes(body.club_type)) {
            return createResponse(400, { message: `Invalid club_type. Valid values: ${CLUB_TYPES}.` }, origin);
        }

        const club_account_id = generate_club_Id(body.club_name);

        const dynamodbCommand = new PutItemCommand({
            TableName: process.env.CLUB_TABLE_NAME,
            Item: {
                "club_type": { S: body.club_type },
                "club_name": { S: body.club_name },
                "club_account_id": { S: club_account_id }
            }
        });

        const dynamodbResponse = await dynamodbClient.send(dynamodbCommand);
        console.log('Club added to table successfully: ', dynamodbResponse)

        return createResponse(
            200,
            {
                message: "Successfully added club.",
                club_account_id: club_account_id
            },
            origin
        );
    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
