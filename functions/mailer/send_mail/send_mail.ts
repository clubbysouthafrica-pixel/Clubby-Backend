import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log("-------------------------------")
    console.log(`EVENT @ ${new Date()}: `, event);

    const params = {
        Source: "gregtorrington@icloud.com",
        Destination: {
            ToAddresses: ["gr3gorytorrington@icloud.com"],
        },
        Message: {
            Subject: {
                Data: "Test Email from SES",
                Charset: "UTF-8",
            },
            Body: {
                Text: {
                    Data: "This is a test email sent using AWS SES and TypeScript.",
                    Charset: "UTF-8",
                },
            },
        },
    };

    try {
        const command = new SendEmailCommand(params);
        const response = await sesClient.send(command);
        console.log("Email sent successfully:", response.MessageId);
    } catch (error) {
        console.error("Error sending email:", error);
    }
    console.log("-------------------------------")
};
