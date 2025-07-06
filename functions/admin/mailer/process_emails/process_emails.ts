import {
    createResponse,
    deconstructEvent,
    sendSqsMessage,
    getItem
} from "./function_helpers";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({ region: process.env.REGION });

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
    if (body?.subject == null || body.email_body == null || body.user_ids == null || body.club_account_id == null) {
        return "Invalid request. subject, email_body, user_ids, club_account_id requried in body."
    }
    if (typeof body.subject !== 'string' || typeof body.email_body !== 'string' || typeof body.club_account_id !== 'string') {
        return "Invalid request. subject, email_body, club_account_id must be of type string."
    }
    if (!Array.isArray(body.user_ids) || !body.user_ids.every((id: any) => typeof id === 'string')) {
        return "Invalid request. IDs must be an array of strings."
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

        const get_sent_24_hour_message = await getSentLast24Hours(body.user_ids);
        if (get_sent_24_hour_message) {
            return createResponse(500, { message: get_sent_24_hour_message }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            { club_account_id: body.club_account_id }
        );

        if (!club) {
            return createResponse(400, { message: "Club does not exist." }, origin);
        }

        let emails: string[] = [];
        body.user_ids.forEach(async (user_id: string) => {
            const club = await getItem(
                process.env.USERS_TABLE_NAME as string,
                { user_id: user_id }
            );

            if (club) {
                emails.push(club["email"])
            }
        });

        await sendSqsMessage(
            process.env.SEND_EMAIL_QUEUE_URL as string,
            {
                email_source: club.verified_identity,
                emails: emails,
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
