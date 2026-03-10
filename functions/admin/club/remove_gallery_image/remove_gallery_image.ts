import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent
} from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid club_account_id provided." }, origin);
        }

        if (!body?.image_id || typeof body.image_id !== "string") {
            return createResponse(400, { message: "Invalid image_id provided." }, origin);
        }

        try {
            const command = new DeleteObjectCommand({
                Bucket: process.env.IMAGE_BUCKET_NAME,
                Key: body.image_id,
            });
            await s3_client.send(command);
        } catch (deleteError: any) {
            console.error('Gallery image deletion error:', deleteError);
            return createResponse(500, { message: "Failed to remove gallery image." }, origin);
        }

        return createResponse(200, { message: "Gallery image removed successfully" }, origin);

    } catch (error: any) {
        console.error('Gallery image removal error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
