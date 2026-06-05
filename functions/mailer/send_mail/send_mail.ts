import { randomUUID } from "crypto";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { updateItem } from "./function_helpers";

const sesClient = new SESClient({ region: "af-south-1" });
const s3Client = new S3Client({ region: process.env.REGION });

interface InlineImageReference {
    cid: string;
    key: string;
    mime_type: string;
    filename: string;
}

interface LoadedInlineImage extends InlineImageReference {
    data: Uint8Array;
}

interface SentChunkResult {
    recipients: string[];
    message_id: string;
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function processEmailBody(body: string): string {
    let processed = body;

    processed = processed.replace(/<p([^>]*)>/gi, '<p style="margin:2px 0;padding:0;line-height:1.4;"$1>');

    processed = processed.replace(/<h([1-6])([^>]*)>/gi, '<h$1 style="margin:6px 0 2px 0;padding:0;"$2>');

    processed = processed.replace(/<ol([^>]*)>/gi, '<ol style="margin:3px 0 3px 20px;padding-left:20px;"$1>');
    processed = processed.replace(/<ul([^>]*)>/gi, '<ul style="margin:3px 0 3px 20px;padding-left:20px;"$1>');

    processed = processed.replace(/<li([^>]*)>/gi, '<li style="margin:2px 0;padding-left:4px;line-height:1.5;"$1>');

    return processed;
}

function encodeHeader(value: string): string {
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function toBase64Lines(value: Uint8Array | Buffer | string): string {
    const buffer = typeof value === "string"
        ? Buffer.from(value, "utf8")
        : Buffer.isBuffer(value)
            ? value
            : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const base64 = buffer.toString("base64");
    return base64.replace(/.{1,76}/g, "$&\r\n").trim();
}

async function loadInlineImages(inlineImages: InlineImageReference[]): Promise<LoadedInlineImage[]> {
    return Promise.all(inlineImages.map(async (inlineImage) => {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: inlineImage.key,
        }));

        if (!response.Body) {
            throw new Error(`Inline image body missing for key ${inlineImage.key}`);
        }

        return {
            ...inlineImage,
            data: await response.Body.transformToByteArray()
        };
    }));
}

async function storeEmailHistory(
    club_account_id: string,
    source: string,
    support_email: string,
    subject: string,
    rendered_body: string,
    recipients: string[],
    inline_images: LoadedInlineImage[],
    sent_chunks: SentChunkResult[]
) {
    const bucket_name = process.env.CLUB_HISTORY_BUCKET_NAME;
    if (!bucket_name) {
        throw new Error("Server misconfigured: missing CLUB_HISTORY_BUCKET_NAME");
    }

    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const key = `${club_account_id}/email_history/${year_month}/${now.toISOString()}_${randomUUID()}.json`;

    const command = new PutObjectCommand({
        Bucket: bucket_name,
        Key: key,
        Body: JSON.stringify({
            club_account_id,
            source,
            support_email,
            subject,
            recipients,
            recipient_count: recipients.length,
            rendered_body,
            inline_images: inline_images.map((inline_image) => ({
                cid: inline_image.cid,
                key: inline_image.key,
                mime_type: inline_image.mime_type,
                filename: inline_image.filename,
                data_base64: Buffer.from(inline_image.data).toString("base64")
            })),
            sent_chunks,
            sent_at: now.toISOString()
        }),
        ContentType: "application/json",
    });

    await s3Client.send(command);
}

function buildRawEmail(source: string, recipients: string[], subject: string, wrappedBody: string, inlineImages: LoadedInlineImage[]): Uint8Array {
    const boundary = `NextPart_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const parts = [
        `From: ${source}`,
        `To: ${recipients.join(", ")}`,
        `Subject: ${encodeHeader(subject)}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/related; boundary=\"${boundary}\"`,
        "",
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        toBase64Lines(wrappedBody),
    ];

    for (const inlineImage of inlineImages) {
        parts.push(
            `--${boundary}`,
            `Content-Type: ${inlineImage.mime_type}; name=\"${inlineImage.filename}\"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: inline; filename=\"${inlineImage.filename}\"`,
            `Content-ID: <${inlineImage.cid}>`,
            "",
            toBase64Lines(inlineImage.data),
        );
    }

    parts.push(`--${boundary}--`, "");

    return new TextEncoder().encode(parts.join("\r\n"));
}

async function updateClubsEmailBilling(club_account_id: string, total_emails: number, email_amount: number) {
    const now = new Date();
    const year_month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month,
        },
        `SET 
      #total_emails = if_not_exists(#total_emails, :zero) + :total_emails,
      #total_amount = if_not_exists(#total_amount, :zero) + :email_amount,
      #outstanding_amount = if_not_exists(#outstanding_amount, :zero) + :email_amount,
      #email_amount = if_not_exists(#email_amount, :zero) + :email_amount
    `,
        {
            "#total_emails": "total_emails",
            "#total_amount": "total_amount",
            "#outstanding_amount": "outstanding_amount",
            "#email_amount": "email_amount"
        },
        {
            ":total_emails": total_emails,
            ":zero": 0,
            ":email_amount": email_amount,
        }
    );
}

async function sendChunkedEmails(source: string, supportEmail: string, subject: string, body: string, allEmails: string[][], inlineImages: InlineImageReference[], isHtml: boolean = false) {
    const rateLimit = 14;
    const delayMs = 1000;
    const processedBody = isHtml ? body : processEmailBody(body);
    const loadedInlineImages = await loadInlineImages(inlineImages);
    const sentChunks: SentChunkResult[] = [];

    for (let i = 0; i < allEmails.length; i += rateLimit) {
        const batch = allEmails.slice(i, i + rateLimit);

        const batchResults = await Promise.all(batch.map(async (chunk) => {
            const wrappedBody = isHtml ? processedBody : `
            <html>
              <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f7f7f9;padding:24px 0;">
                  <tr>
                                        <td style="padding:0 24px;">
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                        <tr>
                          <td style="padding:24px;">
                            ${processedBody}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 24px 24px 24px;border-top:1px solid #e5e7eb;">
                            <p style="margin:12px 0 0 0;line-height:1.6;color:#6b7280;font-size:14px;">Please do not reply to this email. For further support, contact us at <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;">${supportEmail}</a>.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>`;

            try {
                const command = new SendRawEmailCommand({
                    Source: source,
                    Destinations: chunk,
                    RawMessage: {
                        Data: buildRawEmail(source, chunk, subject, wrappedBody, loadedInlineImages)
                    }
                });
                const response = await sesClient.send(command);
                console.log("Email sent successfully:", response.MessageId);
                return {
                    recipients: chunk,
                    message_id: response.MessageId as string
                };
            } catch (error) {
                console.error("Error sending email to chunk:", error);
                throw error;
            }
        }));

        sentChunks.push(...batchResults);

        if (i + rateLimit < allEmails.length) {
            await delay(delayMs);
        }
    }

    return {
        renderedBody: processedBody,
        loadedInlineImages,
        sentChunks
    };
}

export const handler = async (event: any) => {
    console.log("-------------------------------");
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const {
                club_account_id,
                email_source,
                emails,
                subject,
                email_body,
                inline_images = [],
                free_email_limit,
                email_fee,
                support_email,
                emails_sent,
                is_html = false
            } = body;

            const totalEmails = emails.length;

            let totalAmount = 0;
            if (emails_sent >= free_email_limit) {
                totalAmount = totalEmails * email_fee;
            } else if (emails_sent + totalEmails > free_email_limit) {
                totalAmount = (emails_sent + totalEmails - free_email_limit) * email_fee
            }

            const chunkedEmails = chunkArray(emails, 45);
            const { renderedBody, loadedInlineImages, sentChunks } = await sendChunkedEmails(
                email_source,
                support_email,
                subject,
                email_body,
                chunkedEmails as string[][],
                inline_images as InlineImageReference[],
                is_html
            );

            await storeEmailHistory(
                club_account_id,
                email_source,
                support_email,
                subject,
                renderedBody,
                emails,
                loadedInlineImages,
                sentChunks
            );

            await updateClubsEmailBilling(club_account_id, totalEmails, totalAmount);
        }
    } catch (error) {
        console.error("Error processing event:", error);
    }

    console.log("-------------------------------");
};
