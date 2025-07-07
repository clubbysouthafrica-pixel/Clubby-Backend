import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createResponse, deconstructEvent } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const key = `admin_profile/${user_id}_profile`;
        const contentType = 'image/jpeg';

        // Generate PUT URL (upload)
        const putCommand = new PutObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });
        const putUrl = await getSignedUrl(s3_client, putCommand, { expiresIn: 60 * 5 });

        // Generate GET URL (fetch)
        const getCommand = new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: key,
          });
          const getUrl = await getSignedUrl(s3_client, getCommand, { expiresIn: 60 * 5 });

        return createResponse(200, { uploadUrl: putUrl, fetchUrl: getUrl }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
