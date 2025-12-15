import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { updateItem } from "./function_helpers";

const sesClient = new SESClient({ region: "af-south-1" });

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

    processed = processed.replace(/<ol([^>]*)>/gi, '<ol style="margin:4px 0;padding-left:20px;"$1>');
    processed = processed.replace(/<ul([^>]*)>/gi, '<ul style="margin:4px 0;padding-left:20px;"$1>');

    processed = processed.replace(/<li([^>]*)>/gi, '<li style="margin:2px 0;"$1>');

    return processed;
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

async function sendChunkedEmails(source: string, supportEmail: string, subject: string, body: string, allEmails: string[][]) {
    const rateLimit = 14;
    const delayMs = 1000;
    const processedBody = processEmailBody(body);

    for (let i = 0; i < allEmails.length; i += rateLimit) {
        const batch = allEmails.slice(i, i + rateLimit);

        await Promise.all(batch.map(async (chunk) => {
            const wrappedBody = `
            <html>
              <body style="margin:0;padding:0;background:#f7f7f9;font-family: Arial, Helvetica, sans-serif;color:#1f2937;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f9;padding:24px 0;">
                  <tr>
                    <td align="center">
                      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
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

            const params = {
                Destination: {
                    ToAddresses: chunk,
                },
                Message: {
                    Body: {
                        Html: {
                            Charset: "UTF-8",
                            Data: wrappedBody,
                        },
                    },
                    Subject: {
                        Charset: "UTF-8",
                        Data: subject,
                    },
                },
                Source: source,
            };

            try {
                const command = new SendEmailCommand(params);
                const response = await sesClient.send(command);
                console.log("Email sent successfully:", response.MessageId);
            } catch (error) {
                console.error("Error sending email to chunk:", error);
            }
        }));

        if (i + rateLimit < allEmails.length) {
            await delay(delayMs);
        }
    }
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
                free_email_limit,
                email_fee,
                support_email,
                emails_sent
            } = body;

            const totalEmails = emails.length;

            let totalAmount = 0;
            if (emails_sent >= free_email_limit) {
                totalAmount = totalEmails * email_fee;
            } else if (emails_sent + totalEmails > free_email_limit) {
                totalAmount = (emails_sent + totalEmails - free_email_limit) * email_fee
            }

            const chunkedEmails = chunkArray(emails, 45);
            await sendChunkedEmails(email_source, support_email, subject, email_body, chunkedEmails as string[][]);

            await updateClubsEmailBilling(club_account_id, totalEmails, totalAmount);
        }
    } catch (error) {
        console.error("Error processing event:", error);
    }

    console.log("-------------------------------");
};
