import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent,
    getItem,
    removeItem
} from "./function_helpers";

const s3Client = new S3Client({});

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body?.user_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, user_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.user_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }


        const club_member = await removeItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                "club_account_id": body.club_account_id,
                "user_id": body.user_id
            }
        )

        if (!club_member) {
            return createResponse(500, { message: "Club member does not exist." }, origin);
        }

        const now = new Date();
        const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const bucket_name = process.env.CLUB_HISTORY_BUCKET_NAME;
        const uploadParams = {
            Bucket: bucket_name,
            Key: `${body.club_account_id}/previous_seasons_club_members/${year_month}.json`,
            Body: JSON.stringify(club_member),
            ContentType: "application/json",
        };
        const command = new PutObjectCommand(uploadParams);
        console.log(`@@@ putItem request (Bucket_Name: ${bucket_name}): `, JSON.stringify(command));
        const response = await s3Client.send(command);
        console.log(`@@@ putItem response (Bucket_Name: ${bucket_name}): `, JSON.stringify(response));

        return createResponse(200, { message: "Members successfully deregistered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
function getItems(arg0: string, arg1: { club_account_id: any; user_id: any; }) {
    throw new Error("Function not implemented.");
}

