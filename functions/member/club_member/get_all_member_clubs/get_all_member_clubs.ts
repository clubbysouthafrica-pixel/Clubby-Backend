import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const clubs = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "user_id = :user_id",
            { ":user_id": user_id as string }
        )

        if (clubs == null) {
            return createResponse(200, { items: [] }, origin);
        }

        const items = await Promise.all(clubs.map(async item => {
            delete item.user_id;
            const cover_key = `club_cover/${item.club_account_id}_cover`;
            const getCoverCommand = new GetObjectCommand({
                Bucket: process.env.IMAGE_BUCKET_NAME,
                Key: cover_key,
            });
            const get_cover_url = await getSignedUrl(s3_client, getCoverCommand, { expiresIn: 60 * 5 });
        
            const profile_key = `club_cover/${item.club_account_id}_profile`;
            const getProfileCommand = new GetObjectCommand({
                Bucket: process.env.IMAGE_BUCKET_NAME,
                Key: profile_key,
            });
            const get_profile_url = await getSignedUrl(s3_client, getProfileCommand, { expiresIn: 60 * 5 });

            item.club_profile_url = get_profile_url
            item.club_cover_url = get_cover_url
            
            return item;
        }));

        return createResponse(200, { items }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
