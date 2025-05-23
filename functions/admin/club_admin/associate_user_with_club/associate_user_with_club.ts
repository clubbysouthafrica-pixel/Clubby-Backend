import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse, CLUB_TYPES, ACCESS } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (body?.user_id == null || body?.club_account_id == null || body?.club_type == null || body?.access == null) {
            return createResponse(400, { message: "user_id, club_account_id, club_type and access required." }, origin);
        }

        if (!CLUB_TYPES.includes(body.club_type)) {
            return createResponse(400, { message: `Invalid club_type. Valid values: ${CLUB_TYPES}.` }, origin);
        }

        if (!ACCESS.includes(body.access)) {
            return createResponse(400, { message: `Invalid access. Valid values: ${ACCESS}.` }, origin);
        }

        const userCommand = new GetItemCommand({
            TableName: process.env.USERS_TABLE_NAME,
            Key: {
                user_type: { S: "ADMIN" },
                user_id: { S: body.user_id }
            }
        });
        const userResponse = await dynamodbClient.send(userCommand);
        if (!userResponse.Item) {
            return createResponse(200, { message: "User not found." }, origin);
        }

        const clubCommand = new GetItemCommand({
            TableName: process.env.CLUBS_TABLE_NAME,
            Key: {
                club_type: { S: body.club_type },
                club_account_id: { S: body.club_account_id }
            }
        });
        const clubResponse = await dynamodbClient.send(clubCommand);
        if (!clubResponse.Item) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        const clubAdminCommand = new PutItemCommand({
            TableName: process.env.CLUB_ADMIN_ACCOUNT_TABLE_NAME,
            Item: {
                "user_id": { S: body.user_id },
                "club_account_id": { S: body.club_account_id },
                "access": { S: body.access }
            }
        });
        const clubAdminResponse = await dynamodbClient.send(clubAdminCommand);
        console.log('Admin successfully associated with club: ', clubAdminResponse)

        return createResponse(200, { message: "Admin successfully associated with club." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
