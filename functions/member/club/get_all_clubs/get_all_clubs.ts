import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, scanItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const clubs = await scanItems(process.env.CLUB_TABLE_NAME as string)

        const items = await Promise.all(clubs.map(async (item) => {
            const cover_key = `club_cover/${item.club_account_id}_cover`;
            const getCoverCommand = new GetObjectCommand({
                Bucket: process.env.IMAGE_BUCKET_NAME,
                Key: cover_key,
            });
            const get_cover_url = await getSignedUrl(s3_client, getCoverCommand, { expiresIn: 60 * 5 });
        
            return {
                currency: item.currency,
                club_name: item.club_name,
                club_cover_url: get_cover_url,
                club_account_id: item.club_account_id,
                club_type: item.club_type
            };
        }));

        return createResponse(200, { items }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
