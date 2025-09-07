import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

const s3Client = new S3Client({});

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body?.user_ids == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, user_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }
        if (!Array.isArray(body.user_ids)) {
            return createResponse(400, { message: "user_id must be ARRAY type." }, origin);
        }

        const club_members = [];
        for (const user_id of body.user_ids) {
            const member = await updateItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    "club_account_id": body.club_account_id,
                    "user_id": user_id
                },
                `SET 
                    #registered = :registered,
                    #outstanding_amount = #registration_amount
                `,
                {
                    "#registered": "registered",
                    "#outstanding_amount": "outstanding_amount",
                    "#registration_amount": "registration_amount",
                },
                {
                    ":registered": false
                },
                undefined,
                true
            );
            if (!member) {
                console.log(`User, ${user_id}, does not exist as a club member for club, ${body.club_account_id}.`)
                continue
            }
            club_members.push(member);
        }

        const season_id = Date.now()
        const bucket_name = process.env.CLUB_HISTORY_BUCKET_NAME;
        const uploadParams = {
            Bucket: bucket_name,
            Key: `${body.club_account_id}/club_members/${season_id}.json`,
            Body: JSON.stringify(club_members),
            ContentType: "application/json",
        };
        const command = new PutObjectCommand(uploadParams);
        console.log(`@@@ putItem request (Bucket_Name: ${bucket_name}): `, JSON.stringify(command));
        const response = await s3Client.send(command);
        console.log(`@@@ putItem response (Bucket_Name: ${bucket_name}): `, JSON.stringify(response));


        return createResponse(200, { message: "Successfully deregistered members" }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
