import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent,
    queryItems,
    updateItem
} from "./function_helpers";

const s3Client = new S3Client({});

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const club_members = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": body.club_account_id },
            process.env.CLUB_ACCOUNT_ID_INDEX as string
        )

        if (!club_members || club_members.length < 1) {
            return createResponse(400, { message: "No members exist for this club." }, origin);
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

        for (const club_member of club_members) {
            await updateItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    "club_account_id": body.club_account_id,
                    "user_id": club_member.user_id
                },
                `SET 
                    #registered = :registered,
                    #outstanding_amount = #registration_amount,
                    #resubmission_required = :resubmission_required
                `,
                {
                    "#registered": "registered",
                    "#outstanding_amount": "outstanding_amount",
                    "#registration_amount": "registration_amount",
                    "#resubmission_required": "resubmission_required"
                },
                {
                    ":registered": false,
                    ":resubmission_required": true
                }
            );
        }

        return createResponse(200, { message: "Members successfully deregistered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
