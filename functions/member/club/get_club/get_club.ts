import { GetObjectCommand, S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

async function getClubImageUrls(club_account_id: string): Promise<Record<string, string | undefined>> {
    const result: Record<string, string | undefined> = {
        club_cover_url: undefined,
        club_profile_url: undefined
    };

    const cover_key = `club_cover/${club_account_id}_cover`;
    try {
        await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: cover_key }));
        const getCoverCommand = new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: cover_key,
        });
        result.club_cover_url = await getSignedUrl(s3_client, getCoverCommand, { expiresIn: 60 * 5 });
    } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
        if (status && status !== 404) {
            console.error(`Error checking cover image ${cover_key}:`, err);
        }
        result.club_cover_url = undefined;
    }

    const profile_key = `club_profile/${club_account_id}_profile`;
    try {
        await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: profile_key }));
        const getProfileCommand = new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: profile_key,
        });
        result.club_profile_url = await getSignedUrl(s3_client, getProfileCommand, { expiresIn: 60 * 5 });
    } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
        if (status && status !== 404) {
            console.error(`Error checking profile image ${profile_key}:`, err);
        }
        result.club_profile_url = undefined;
    }

    return result;
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

        const club_member_exists = club_member ? true : false;
        const resubmission_required = club_member?.resubmission_required ?? false
        const registered = club_member ? (club_member?.registered ? true : false) : false;

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        const onboarded = Boolean(
            form &&
            item?.["country_of_operation"] &&
            item?.["currency"] &&
            item?.["account_type"] &&
            item?.["branch_code"] &&
            item?.["account_number"] &&
            item?.["bank"]
        );

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
            payfast_enabled: item?.payfast_enabled ?? false,
            club_url: item?.club_url ?? undefined,
            deregistration_in_progress: item?.deregistration_in_progress ?? false,
            onboarded,
            club_member_exists,
            registered,
            resubmission_required,
            ...await getClubImageUrls(query_string_params.club_account_id)
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
