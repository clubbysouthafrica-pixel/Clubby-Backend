import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, getItem } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

async function getClubImageUrls(get_images: string, club_account_id: string): Promise<Record<string, string>> {
    const cover_key = `club_cover/${club_account_id}_cover`;
    const getCoverCommand = new GetObjectCommand({
        Bucket: process.env.IMAGE_BUCKET_NAME,
        Key: cover_key,
    });
    const get_cover_url = await getSignedUrl(s3_client, getCoverCommand, { expiresIn: 60 * 5 });

    const profile_key = `club_profile/${club_account_id}_profile`;
    const getProfileCommand = new GetObjectCommand({
        Bucket: process.env.IMAGE_BUCKET_NAME,
        Key: profile_key,
    });
    const get_profile_url = await getSignedUrl(s3_client, getProfileCommand, { expiresIn: 60 * 5 });

    return {
        club_cover_url: get_cover_url,
        club_profile_url: get_profile_url
    }
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_type and club_account_id required." }, origin);
        }

        const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (item == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        let club_member: Record<string, any> | null = null;
        if (user_id) {
            club_member = await getItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            });
        }

        const member_exists = club_member ? true : false;
        const registered = club_member ? (club_member?.registered ? true : false) : false;

        return createResponse(200, {
            user_id: user_id,
            currency: item.currency,
            club_account_id: item["club_account_id"],
            club_type: item["club_type"],
            club_name: item["club_name"],
            description: item["description"] ?? undefined,
            address: item["address"] ?? undefined,
            support_email: item["support_email"],
            country_of_operation: item["country_of_operation"],
            joined: item["joined"],
            club_member_exists: member_exists,
            registered: registered,
            ...await getClubImageUrls(query_string_params?.get_club_images, query_string_params.club_account_id)
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
