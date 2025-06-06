import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse, ACCESS, getItemByKey } from "./function_helpers";

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

        if (body?.user_id == null || body?.club_account_id == null || body?.access == null) {
            return createResponse(400, { message: "user_id, club_account_id, and access required." }, origin);
        }

        if (!ACCESS.includes(body.access)) {
            return createResponse(400, { message: `Invalid access. Valid values: ${ACCESS}.` }, origin);
        }

        const user = await getItemByKey(process.env.USERS_TABLE_NAME as string, {
            user_type: "ADMIN",
            user_id: body.user_id
        });
        if (user == null) {
            return createResponse(200, { message: "User not found." }, origin);
        }

   
        const club = await getItemByKey(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: body.club_account_id
        })
        if (club == null) {
            return createResponse(200, { message: "Club not found." }, origin);
        }

        const clubAdminCommand = new PutItemCommand({
            TableName: process.env.CLUB_ADMIN_ACCOUNT_TABLE_NAME,
            Item: {
                "user_id": { S: body.user_id },
                "club_account_id": { S: body.club_account_id },
                "club_type": { S: club.club_type as string },
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
