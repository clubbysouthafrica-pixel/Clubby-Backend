import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export interface GalleryImage {
  key: string;
  url: string;
}

async function getClubImageUrls(club_account_id: string): Promise<Record<string, string | undefined>> {
    const result: Record<string, string | undefined> = {
        club_cover_url: undefined,
        club_profile_url: undefined
    };

    const cover_key = `club_cover/${club_account_id}_cover`;
    try {
        await s3_client.send(new HeadObjectCommand({ Bucket: process.env.IMAGE_BUCKET_NAME, Key: cover_key }));
        result.club_cover_url = `${process.env.ASSETS_CDN_URL}/${cover_key}`;
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
        result.club_profile_url = `${process.env.ASSETS_CDN_URL}/${profile_key}`;
    } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
        if (status && status !== 404) {
            console.error(`Error checking profile image ${profile_key}:`, err);
        }
        result.club_profile_url = undefined;
    }

    return result;
}

async function getGalleryImages(clubAccountId: string): Promise<GalleryImage[]> {
  try {
    const prefix = `gallery/${clubAccountId}/`;
    
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.IMAGE_BUCKET_NAME,
      Prefix: prefix,
    });

    const listResponse = await s3_client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return [];
    }

    const galleryImages: GalleryImage[] = [];

    for (const object of listResponse.Contents) {
      if (object.Key) {
        galleryImages.push({
          key: object.Key,
          url: `${process.env.ASSETS_CDN_URL}/${object.Key}`,
        });
      }
    }

    return galleryImages;
  } catch (error) {
    console.error("Error fetching gallery images:", error);
    throw error;
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

        const club_member_exists = club_member ? true : false;
        const resubmission_required = club_member?.resubmission_required ?? false
        const registered = club_member ? (club_member?.registered ? true : false) : false;

        const form = await queryItems(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        let form_name = ""
        form?.forEach((item) => {
            if (!item.visible) return
            form_name = item.form_name;
        });

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
            form_name: form_name === "" ? "Join Club" : form_name,
            user_id: user_id,
            member_name: `${club_member?.member_first_name ?? ""} ${club_member?.member_surname ?? ""}`.trim(),
            currency: item.currency,
            public_shop: item?.public_shop ?? false,
            club_account_id: item["club_account_id"],
            venues_enabled: item["venues_enabled"] ?? false,
            enable_storage: item?.enable_storage ?? false,
            enable_shop: item["enable_shop"] ?? false,
            enable_events: item["enable_events"] ?? false,
            club_type: item["club_type"],
            club_name: item["club_name"],
            description: item["description"] ?? undefined,
            address: item["address"] ?? undefined,
            support_email: item["support_email"],
            country_of_operation: item["country_of_operation"],
            joined: item["joined"],
            payfast_enabled: item?.payfast_enabled ?? false,
            snapscan_enabled: item?.snapscan_enabled ?? false,
            custom_payment_methods: item?.custom_payment_methods ?? [],
            club_url: item?.club_url ?? undefined,
            instagram: item?.instagram_url ?? undefined,
            facebook: item?.facebook_url ?? undefined,
            opening_times: item?.opening_times ?? undefined,
            about_club: item?.about_club ?? undefined,
            deregistration_in_progress: item?.deregistration_in_progress ?? false,
            onboarded,
            club_member_exists,
            non_registration: club_member?.non_registration ?? false,
            registered,
            resubmission_required,
            ...await getClubImageUrls(query_string_params.club_account_id),
            gallery_images: await getGalleryImages(query_string_params.club_account_id)
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
