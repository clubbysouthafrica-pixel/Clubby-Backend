import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }

        const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: query_string_params.club_account_id
        });

        if (item == null) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const cover_key = `club_cover/${query_string_params.club_account_id}_cover`;
        const profile_key = `club_profile/${query_string_params.club_account_id}_profile`;

        const coverPut = new PutObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: cover_key,
            ContentType: "image/jpeg",
        });
        const profilePut = new PutObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: profile_key,
            ContentType: "image/jpeg",
        });

        const [cover_upload_url, profile_upload_url] = await Promise.all([
            getSignedUrl(s3_client, coverPut, { expiresIn: 60 * 5 }),
            getSignedUrl(s3_client, profilePut, { expiresIn: 60 * 5 }),
        ]);

        let cover_fetch_url: string | undefined = undefined;
        let profile_fetch_url: string | undefined = undefined;

        try {
            await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: cover_key }));
            const getCover = new GetObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: cover_key });
            cover_fetch_url = await getSignedUrl(s3_client, getCover, { expiresIn: 60 * 5 });
        } catch (err: any) {
            const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
            if (status && status !== 404) {
                console.error(`Error checking cover image ${cover_key}:`, err);
            }
        }

        try {
            await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: profile_key }));
            const getProfile = new GetObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: profile_key });
            profile_fetch_url = await getSignedUrl(s3_client, getProfile, { expiresIn: 60 * 5 });
        } catch (err: any) {
            const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
            if (status && status !== 404) {
                console.error(`Error checking profile image ${profile_key}:`, err);
            }
        }

        const registration_form_exists = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        );

        return createResponse(200, {
            club_account_id: item["club_account_id"],
            registration_form_exists: registration_form_exists ? true : false,
            currency_exists: item?.currency ? true : false,
            country_exists: item?.country_of_operation ? true : false,
            bank_details_exists: item?.account_number && item?.bank && item?.branch_code && item?.account_type ? true : false,
            club_type: item["club_type"],
            season_cycle: item?.season_cycle ?? 1,
            club_name: item["club_name"],
            currency: item["currency"] ?? undefined,
            description: item["description"] ?? undefined,
            address: item["address"] ?? undefined,
            support_email: item["support_email"],
            country_of_operation: item["country_of_operation"],
            joined: item["joined"],
            hide_from_public: item?.hide_from_public ?? false,
            deregistration_in_progress: item?.deregistration_in_progress ?? false,
            images: query_string_params?.includeImages === "true" ? {
                cover: { uploadUrl: cover_upload_url, fetchUrl: cover_fetch_url },
                profile: { uploadUrl: profile_upload_url, fetchUrl: profile_fetch_url },
            } : undefined
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
