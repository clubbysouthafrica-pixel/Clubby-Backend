import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createResponse, deconstructEvent, getItem } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

function validateQueryStrings(query_string_params: any): string | null {
    if (query_string_params?.club_account_id == null) {
        return "Invalid query string parameters. Required: club_account_id."
    }

    if (typeof query_string_params.club_account_id !== 'string') {
        return "Invalid query string parameters. Required: club_account_id must be STRING."
    }

    return null
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_params_response = validateQueryStrings(query_string_params)
        if (invalid_params_response) {
            return createResponse(400, { message: invalid_params_response }, origin);
        }

        const key = `cover/${query_string_params.club_account_id}_cover`;
        const contentType = 'image/jpeg';

        const club = getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (!club) {
            return createResponse(400, { message: 'Club does not exist.' }, origin);
        }

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
