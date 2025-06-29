import {
    createResponse,
    deconstructEvent,
    sendSqsMessage,
    getItem
} from "./function_helpers";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.REGION });

async function getSentLast24Hours(): Promise<number | undefined> {
    const command = new GetSendQuotaCommand({});
    const response = await sesClient.send(command);
    return  response.SentLast24Hours
}

function validateBody(body: any): string | null {
    if (body?.subject == null || body.email_body == null || body.emails == null || body.club_account_id == null) {
        return "Invalid request. subject, email_body, emails, club_account_id requried in body."
    }
    if (typeof body.subject !== 'string' || typeof body.email_body !== 'string' || typeof body.club_account_id !== 'string') {
        return "Invalid request. subject, email_body, club_account_id must be of type string."
    }
    if (!Array.isArray(body.emails) || !body.emails.every((email: any) => typeof email === 'string')) {
        return "Invalid request. emails must be an array of strings."
    }

    return null;
}


export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const invalid_body_message = validateBody(body)
        if (invalid_body_message) {
            return createResponse(400, { message: invalid_body_message }, origin);
        }

        const sent_last_24_hours = await getSentLast24Hours();

        if (!sent_last_24_hours) {
            return createResponse(400, { message: "Unable to retrieve current sending usage. Please try again later." }, origin);
        }

        if (sent_last_24_hours >= Number(process.env.SENDING_LIMIT)) {
            return createResponse(400, { message: "Daily sending limit reached. Please try again after 24 hours." }, origin);
        } else if (sent_last_24_hours + body.emails.length >= Number(process.env.SENDING_LIMIT)) {
            return createResponse(
                400, 
                {  
                    message: `Daily sending limit would be exceeded with this request. Only ${sent_last_24_hours} email(s) can be sent at this time.` 
                }, 
                origin
            );
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: body.club_account_id }
        );

        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        await sendSqsMessage(
            process.env.SEND_EMAIL_QUEUE_URL as string,
            {
                email_source: club.verified_identity,
                emails: body.emails,
                subject: body.subject,
                email_body: body.email_body
            },
            "Bulk_Email"
        );

        return createResponse(200, { message: "Emails successfully queued." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
