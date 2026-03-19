import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { createResponse, deconstructEvent, getItem } from "./function_helpers";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3_client = new S3Client({ region: process.env.REGION });

export interface GalleryImage {
  key: string;
  url: string;
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
        const getCommand = new GetObjectCommand({
          Bucket: process.env.IMAGE_BUCKET_NAME,
          Key: object.Key,
        });

        const signedUrl = await getSignedUrl(s3_client, getCommand, { expiresIn: 3600 });

        galleryImages.push({
          key: object.Key,
          url: signedUrl,
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
  const { origin, body, query_string_params, user_id } =
    deconstructEvent(event);

  try {
    if (query_string_params?.club_account_id == null) {
      return createResponse(
        400,
        { message: "club_account_id required." },
        origin,
      );
    }

    const item = await getItem(process.env.CLUB_TABLE_NAME as string, {
      club_account_id: query_string_params.club_account_id,
    });

    if (item == null) {
      return createResponse(200, {}, origin);
    }

    const hasBankDetails =
      item?.bank &&
      item?.account_number &&
      item?.branch_code &&
      item?.account_type;

    return createResponse(
      200,
      {
        bank_details: hasBankDetails
          ? {
            bank: item.bank,
            account_number: item.account_number,
            branch_code: item.branch_code,
            account_type: item.account_type,
          }
          : undefined,
        instagram_url: item?.instagram_url,
        club_variables: item?.club_variables ?? undefined,
        facebook_url: item?.facebook_url,
        about_club: item?.about_club,
        auto_register_members_if_paid: item?.auto_register_members_if_paid ?? false,
        opening_times: item?.opening_times,
        country_of_operation: item?.country_of_operation,
        currency: item?.currency,
        support_email: item?.support_email,
        notify_on_member_registration:
          item?.notify_on_member_registration ?? true,
        registration_submission_email_template_body:
          item?.registration_submission_email_template_body,
        registration_submission_email_subject:
          item?.registration_submission_email_subject,
        registration_success_email_template_body:
          item?.registration_success_email_template_body,
        registration_success_email_subject:
          item?.registration_success_email_subject,
        use_submission_email_template:
          item?.use_submission_email_template ?? false,
        use_success_email_template: item?.use_success_email_template ?? false,
        payfast_enabled: item?.payfast_enabled ?? false,
        custom_payment_methods: item?.custom_payment_methods ?? [],
        club_url: item?.club_url ?? undefined,
        hide_from_public: item?.hide_from_public ?? false,
        gallery_images: await getGalleryImages(query_string_params.club_account_id),
      },
      origin,
    );
  } catch (error) {
    console.error("Error:", error);
    return createResponse(500, { message: "Internal Server Error" }, origin);
  }
};
