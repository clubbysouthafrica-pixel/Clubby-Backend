import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

        if (body.gallery_image !== undefined) {
            if (typeof body.gallery_image !== "string" || !body.gallery_image.startsWith("data:")) {
                return createResponse(400, { message: "Invalid gallery_image provided (Must be a base64 data URL)." }, origin);
            }
        } else if (!body.gallery_image) {
            return createResponse(400, { message: "gallery_image is required." }, origin);
        }

        const gallery_image_key = `gallery/${body.club_account_id}/${body.image_id}`;

        try {
            const base64Data = body.gallery_image.split(",")[1];
            const buffer = Buffer.from(base64Data, "base64");
            const mimeMatch = body.gallery_image.match(/^data:(.+);base64,/);
            const contentType = mimeMatch ? mimeMatch[1] : "image/jpeg";

            const command = new PutObjectCommand({
                Bucket: process.env.IMAGE_BUCKET_NAME,
                Body: buffer,
                Key: gallery_image_key,
                ContentEncoding: "base64",
                ContentType: contentType,
            });
            await s3_client.send(command);
        } catch (uploadError: any) {
            console.error('Gallery image upload error:', uploadError);
            return createResponse(500, { message: "Failed to upload gallery image." }, origin);
        }

        return createResponse(200, { message: "Gallery image uploaded successfully" }, origin);

    } catch (error: any) {
        console.error('Registration fees reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
