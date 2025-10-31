import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, scanItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const clubs = await scanItems(process.env.CLUB_TABLE_NAME as string)

        const items = await Promise.all(clubs.map(async (item) => {        
            return {
                currency: item.currency,
                club_name: item.club_name,
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
