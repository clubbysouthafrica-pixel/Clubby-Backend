import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createResponse, deconstructEvent } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

function validateBody(body: any): string | null {
    if (body?.image_data == null ||  body?.club_account_id == null) {
        return "Invalid body. Required attributes: image_data, club_account_id."
    }

    if (typeof body.image_data !== 'string' && body.club_account_id !== 'string') {
        return "Invalid body. Required attributes: image_data (in base64 format), club_account_id must be STRING."
    }

    return null
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_response = validateBody(body)
        if (invalid_body_response) {
            return createResponse(400, { message: invalid_body_response }, origin);
        }

        const buffer = Buffer.from(body.image_data, 'base64');

        const key = `cover/${body.club_account_id}_cover`;

        await s3_client.send(new PutObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: 'image/jpeg'
        }));

        return createResponse(200, { message: "User successfully registered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
