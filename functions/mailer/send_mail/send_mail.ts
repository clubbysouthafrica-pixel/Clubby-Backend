import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: "eu-west-2" });

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

export const handler = async (event: any) => {
    console.log("-------------------------------");
    console.log(`EVENT @ ${new Date()}: `, event);

    try {
        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const email_source = body.email_source as string;
            const emails = body.emails as string[];
            const subject = body.subject as string;
            const email_body = body.email_body as string;

            const chunkedEmails = chunkArray(emails, 45);

            const rateLimit = 14;
            const delayMs = 1000;

            for (let i = 0; i < chunkedEmails.length; i += rateLimit) {
                const batch = chunkedEmails.slice(i, i + rateLimit);

                await Promise.all(batch.map(async (chunk) => {
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
                                    Data: email_body,
                                    Charset: "UTF-8",
                                },
                            },
                        },
                    };

                    const command = new SendEmailCommand(params);
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
