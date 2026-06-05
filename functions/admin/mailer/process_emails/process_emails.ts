import {
    createResponse,
    deconstructEvent,
    sendSqsMessage,
    getItem
} from "./function_helpers";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const sesClient = new SESClient({ region: process.env.REGION });
const s3Client = new S3Client({ region: process.env.REGION });
const INLINE_IMAGE_DATA_URL_REGEX = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)/gi;

interface InlineImageReference {
    cid: string;
    key: string;
    mime_type: string;
    filename: string;
}

function buildInlineImageKey(clubAccountId: string, mimeType: string): string {
    const extension = mimeType.split("/")[1]?.split("+")[0] ?? "bin";
    return `mailer/${clubAccountId}/${randomUUID()}.${extension}`;
}

async function uploadInlineImages(emailBody: string, clubAccountId: string): Promise<{ emailBody: string; inlineImages: InlineImageReference[] }> {
    if (!emailBody.includes("data:image/")) {
        return {
            emailBody,
            inlineImages: []
        };
    }

    const imageBucketName = process.env.IMAGE_BUCKET_NAME;

    if (!imageBucketName) {
        throw new Error("Server misconfigured: missing inline image hosting configuration.");
    }

    const replacements = new Map<string, { cidUrl: string; image: InlineImageReference }>();
    const matches = Array.from(emailBody.matchAll(INLINE_IMAGE_DATA_URL_REGEX));

    for (const match of matches) {
        const [dataUrl, mimeType, base64Data] = match;

        if (replacements.has(dataUrl)) {
            continue;
        }

        const key = buildInlineImageKey(clubAccountId, mimeType);
        const cid = `${randomUUID()}@myclubsoftware`;
        const extension = mimeType.split("/")[1]?.split("+")[0] ?? "bin";
        const body = Buffer.from(base64Data.replace(/\s+/g, ""), "base64");

        await s3Client.send(new PutObjectCommand({
            Bucket: imageBucketName,
            Key: key,
            Body: body,
            ContentType: mimeType,
            CacheControl: "public, max-age=31536000, immutable"
        }));

        replacements.set(dataUrl, {
            cidUrl: `cid:${cid}`,
            image: {
                cid,
                key,
                mime_type: mimeType,
                filename: `inline-image.${extension}`
            }
        });
    }

    let transformedBody = emailBody;
    for (const [dataUrl, replacement] of replacements.entries()) {
        transformedBody = transformedBody.split(dataUrl).join(replacement.cidUrl);
    }

    return {
        emailBody: transformedBody,
        inlineImages: Array.from(replacements.values(), ({ image }) => image)
    };
}

async function getSentLast24Hours(emails: string[]): Promise<string | null> {
    const command = new GetSendQuotaCommand({});
    const response = await sesClient.send(command);
    console.log(`@@@ GetSendQuota response: `, JSON.stringify(response));

    if (response.SentLast24Hours === undefined) {
        return "Unable to retrieve current sending usage. Please try again later."
    } else if (response.SentLast24Hours > Number(process.env.SENDING_LIMIT)) {
        return "Daily sending limit reached. Please try again after 24 hours."
    } else if (response.SentLast24Hours + emails.length > Number(process.env.SENDING_LIMIT)) {
        return `Daily sending limit would be exceeded with this request. Only ${Number(process.env.SENDING_LIMIT) - emails.length + 1} email(s) can be sent at this time.`
    }
    return null
}

function validateBody(body: any): string | null {
    if (body?.subject == null || body.email_body == null || body.emails == null || body.club_account_id == null) {
        return "Invalid request. subject, email_body, emails, club_account_id requried in body."
    }
    if (typeof body.subject !== 'string' || typeof body.email_body !== 'string' || typeof body.club_account_id !== 'string') {
        return "Invalid request. subject, email_body, club_account_id must be of type string."
    }
    if (!Array.isArray(body.emails) || !body.emails.every((id: any) => typeof id === 'string')) {
        return "Invalid request. IDs must be an array of strings."
    }
    if (body.is_html !== undefined && typeof body.is_html !== 'boolean') {
        return "Invalid request. is_html must be a boolean."
    }

    return null;
}

async function getClubEmailSendingLimit(club_account_id: string, emails: string[]): Promise<string | Record<string,string | number>> {
    const club = await getItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id: club_account_id
        }
    );

    if (!club) {
        return "Club does not exist."
    }

    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthly_bill = await getItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        }
    )

    const emails_sent = monthly_bill?.total_emails ?? 0;

    if (emails_sent + emails.length > club.maximum_monthly_emails) {
        return `Monthly email limit reached. Available emails: ${club?.maximum_monthly_emails - emails_sent}.`
    }

    return {
        support_email: club.support_email,
        email_source: club.club_from_email,
        free_email_limit: club.free_email_limit,
        email_fee: club.fee_per_email_to_club,
        emails_sent: emails_sent
    }
} 


export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_message = validateBody(body)
        if (invalid_body_message) {
            return createResponse(400, { message: invalid_body_message }, origin);
        }

        const get_sent_24_hour_message = await getSentLast24Hours(body.emails);
        if (get_sent_24_hour_message) {
            return createResponse(500, { message: get_sent_24_hour_message }, origin);
        }

        const club_sending_limit = await getClubEmailSendingLimit(body.club_account_id, body.emails);

        if (typeof club_sending_limit === 'string') {
            return createResponse(400, { message: club_sending_limit }, origin);
        }

        const { emailBody: processedEmailBody, inlineImages } = await uploadInlineImages(body.email_body, body.club_account_id);

        await sendSqsMessage(
            process.env.SEND_EMAIL_QUEUE_URL as string,
            {
                emails: body.emails,
                subject: body.subject,
                email_body: processedEmailBody,
                inline_images: inlineImages,
                club_account_id: body.club_account_id,
                is_html: body.is_html ?? false,
                ...club_sending_limit
            },
            "ChargeableEmails"
        );

        return createResponse(200, { message: "Emails successfully queued." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
