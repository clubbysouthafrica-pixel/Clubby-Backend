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

    for (let i = 0; i < allEmails.length; i += rateLimit) {
        const batch = allEmails.slice(i, i + rateLimit);

        await Promise.all(batch.map(async (chunk) => {
            const footer = `\n\n---\nPlease do not reply to this email. For further support, contact us at ${supportEmail}`;
            const params = {
                Source: source,
                Destination: { ToAddresses: chunk },
                Message: {
                    Subject: { Data: subject, Charset: "UTF-8" },
                    Body: {
                        Text: {
                            Data: source === supportEmail ? body : `${body}\n\n${footer}`,
                            Charset: "UTF-8"
                        }
                    }
                }
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
