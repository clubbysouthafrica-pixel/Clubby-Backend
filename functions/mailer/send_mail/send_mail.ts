import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.REGION });

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}

export const handler = async (event: any) => {
    console.log("-------------------------------")
    console.log(`EVENT @ ${new Date()}: `, event);
    try {
        for (const record of event.Records) {
            const body = JSON.parse(record.body);

            const email_source = body.email_source as string;

            const emails = body.emails as string[];
            const subject = body.subject as string;
            const email_body = body.email_body as string;

            const chunkedEmails = chunkArray(emails, 45);

            for (const chunk of chunkedEmails) {
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
                const response = await sesClient.send(command);
                console.log("Email sent successfully:", response.MessageId);
            }
        }
    } catch (error) {
        console.error("Error sending email:", error);
    }
    console.log("-------------------------------")
};
