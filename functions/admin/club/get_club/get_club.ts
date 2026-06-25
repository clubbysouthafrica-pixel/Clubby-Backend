import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

const getCurrentSeasonMemberCounts = (registrations: Record<string, any>[] | null | undefined) => {
    return (registrations ?? []).reduce((counts, registration) => {
        if (registration?.last_season_registration === true || registration?.deregistered === true) {
            return counts;
        }

        if (registration?.registered_on) {
            counts.total_active_members += 1;
        } else {
            counts.total_pending_members += 1;
        }

        return counts;
    }, {
        total_active_members: 0,
        total_pending_members: 0,
    });
};

const shouldIncludeFlag = (value: unknown) => value === true || value === "true";

const getCurrentYearMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

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

        const includeAccountBalance = shouldIncludeFlag(query_string_params?.includeAccountBalance);

        if (includeAccountBalance && !process.env.MONTHLY_BILLING_TABLE_NAME) {
            return createResponse(500, { message: "Server misconfigured: missing MONTHLY_BILLING_TABLE_NAME" }, origin);
        }

        const [registration_form_exists, registrations, monthly_billing_entries] = await Promise.all([
            queryItems(
                process.env.REGISTRATION_FORM_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id }
            ),
            queryItems(
                process.env.REGISTRATIONS_TABLE_NAME as string,
                "club_account_id = :clubId",
                { ":clubId": query_string_params.club_account_id },
                process.env.REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX
            ),
            includeAccountBalance
                ? queryItems(
                    process.env.MONTHLY_BILLING_TABLE_NAME as string,
                    "club_account_id = :clubId",
                    { ":clubId": query_string_params.club_account_id }
                )
                : Promise.resolve(undefined)
        ]);

        let total_active_members: number | undefined = undefined;
        let total_pending_members: number | undefined = undefined;
        const currentYearMonth = getCurrentYearMonth();
        const account_balance_entries = includeAccountBalance
            ? [...(monthly_billing_entries ?? [])]
                .filter((entry) => {
                    const outstandingAmount = entry?.outstanding_amount ?? 0;
                    return entry?.year_month && entry.year_month !== currentYearMonth && outstandingAmount > 0;
                })
                .sort((left, right) => {
                    const leftMonth = left?.year_month ?? "";
                    const rightMonth = right?.year_month ?? "";
                    return rightMonth.localeCompare(leftMonth);
                })
                .map((entry) => ({
                    month_date: entry.year_month,
                    outstanding_amount: entry.outstanding_amount,
                }))
            : undefined;

        if (query_string_params?.stats === "true") {
            const counts = getCurrentSeasonMemberCounts(registrations);
            total_active_members = counts.total_active_members;
            total_pending_members = counts.total_pending_members;
        }
        
        return createResponse(200, {
            payfast_token: item?.payfast_token ? true : false,
            club_account_id: item["club_account_id"],
            public_shop: item?.public_shop ?? false,
            total_active_members,
            total_pending_members,
            registration_form_exists: registration_form_exists ? true : false,
            currency_exists: item?.currency ? true : false,
            enable_events: item?.enable_events ?? false,
            country_exists: item?.country_of_operation ? true : false,
            bank_details_exists: item?.account_number && item?.bank && item?.branch_code && item?.account_type ? true : false,
            club_type: item["club_type"],
            season_cycle: item?.season_cycle ?? 1,
            club_name: item["club_name"],
            enable_shop: item?.enable_shop ?? false,
            currency: item["currency"] ?? undefined,
            description: item["description"] ?? undefined,
            address: item["address"] ?? undefined,
            support_email: item["support_email"],
            country_of_operation: item["country_of_operation"],
            joined: item["joined"],
            hide_from_public: item?.hide_from_public ?? false,
            deregistration_in_progress: item?.deregistration_in_progress ?? false,
            account_balance_entries,
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
