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

        if (body?.club_account_id == null || body?.user_ids == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, user_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }
        if (!Array.isArray(body.user_ids)) {
            return createResponse(400, { message: "user_id must be ARRAY type." }, origin);
        }

 
        for (const user_id of body.user_ids) {
            await removeItem(
                process.env.CLUB_MEMBER_TABLE_NAME as string,
                {
                    "club_account_id": body.club_account_id,
                    "user_id": user_id
                }
            )
        }

        return createResponse(200, { message: "Members successfully deregistered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
