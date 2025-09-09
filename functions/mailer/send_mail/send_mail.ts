import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { updateItem } from "./function_helpers";

const sesClient = new SESClient({ region: "af-south-1"  });

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

export const handler = async (event: any) => {
    console.log("-------------------------------");
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const club_account_id = body.club_account_id;

            const email_source = body.email_source as string;
            const emails = body.emails as string[];
            const subject = body.subject as string;
            const email_body = body.email_body as string;

            let free_email_limit = body.free_email_limit;
            const email_fee = body.email_fee;

            const chunkedEmails = chunkArray(emails, 45);

            const rateLimit = 14;
            const delayMs = 1000;

            for (let i = 0; i < chunkedEmails.length; i += rateLimit) {
                const batch = chunkedEmails.slice(i, i + rateLimit);

                await Promise.all(batch.map(async (chunk) => {
                    const footer = `\n\n---\nPlease do not reply to this email. For further support, contact us at ${body.support_email}`;
                    const params = {
                        Source: email_source,
                        Destination: {
                            ToAddresses: chunk,
                        },
                        Message: {
                            Subject: {
                                Data: subject,
                                Charset: "UTF-8",
                            },
                            Body: {
                                Text: {
                                    Data: email_source === body.support_email ? email_body : `${email_body}\n\n${footer}`,
                                    Charset: "UTF-8",
                                },
                            },
                        },
                    };

                    const command = new SendEmailCommand(params);

                    if (free_email_limit < chunk.length) {
                        const non_free_emails = chunk.length - free_email_limit
                        free_email_limit = 0
                        await updateClubsEmailBilling(club_account_id, chunk.length, non_free_emails*email_fee)
                    } else {
                        free_email_limit = free_email_limit - chunk.length
                        await updateClubsEmailBilling(club_account_id, chunk.length, 0)
                    }

                    try {
                        const response = await sesClient.send(command);
                        console.log("Email sent successfully:", response.MessageId);
                    } catch (error) {
                        console.error("Error sending email to chunk:", error);
                    }
                }));

                if (i + rateLimit < chunkedEmails.length) {
                    await delay(delayMs);
                }
            }
        }
    } catch (error) {
        console.error("Error processing event:", error);
    }

    console.log("-------------------------------");
};
