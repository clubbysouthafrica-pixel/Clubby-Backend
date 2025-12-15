import { createResponse, CLUB_TYPES, addItem, deconstructEvent, queryItems } from "./function_helpers";

function generate_club_Id(club_name: string): string {
    return `club_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function getJoinedDateString(date: Date = new Date()): string {
    const options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };
    const formatted = date.toLocaleDateString("en-US", options);
    return `Joined ${formatted}`;
}

const EMAIL_TEMPLATE = {
    "registration_submission_email_template_body": `<p>Hi {{member_name}},</p><p><br></p><p>Thank you for submitting your registration to <strong>{{club_name}}</strong>! 🎉</p><p><br></p><p>We’ve received your details and are excited that you’re interested in becoming a member.</p><p><br></p><p><strong>Next Steps to Complete Your Membership:</strong></p><ol><li data-list="ordered"><span class="ql-ui" contenteditable="false"></span><strong>💳 Perform the membership payment: </strong>You can make your payment via EFT. (Make sure to include your unique Clubby reference number as a payment reference. This can be found in your member account.)</li></ol><p><br></p><p>After we verify your payment and confirmation, you’ll officially become a registered member — welcome aboard!</p><p><br></p><p>If you have any questions, please contact us at <a href="mailto:{{club_email}}" rel="noopener noreferrer" target="_blank">{{club_email}}</a>.</p><p><br></p><p>Warm regards,</p><p><strong>The {{club_name}} Team</strong></p>`,
    "registration_success_email_template_body": `<p>Hi {{member_name}},</p><p><br></p><p>🎉 Congratulations and welcome to <strong>{{club_name}}</strong>!</p><p><br></p><p>Your registration has been successfully completed, and you are now an official member of our club.</p><p><br></p><p><strong>What’s Next:</strong></p><ul><li>✅ You now have full access to member benefits and upcoming events.</li><li>💬 Stay tuned for updates and communications from the <strong>{{club_name}}</strong> team.</li></ul><p><br></p><p>If you have any questions or need assistance, please reach out to us at <a href="mailto:{{club_email}}" rel="noopener noreferrer" target="_blank">{{club_email}}</a>.</p><p><br></p><p>We’re thrilled to have you as part of our community!</p><p><br></p><p>Warm regards,</p><p><strong>The {{club_name}} Team</strong></p>`,
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (
            body?.club_type == null ||
            body?.club_name == null ||
            body?.member_registration_fee_to_club == null ||
            body?.club_from_email == null ||
            body?.maximum_monthly_emails == null ||
            body?.fee_per_email_to_club == null ||
            body?.free_email_limit == null ||
            body?.support_email == null
        ) {
            return createResponse(400, { message: 'club_type, member_registration_fee_to_club, club_from_email, maximum_monthly_emails, fee_per_email_to_club, free_email_limit, support_email and club_name required.' }, origin);
        }

        if (!CLUB_TYPES.includes(body.club_type)) {
            return createResponse(400, { message: `Invalid club_type. Valid values: ${CLUB_TYPES}.` }, origin);
        }

        if (
            typeof body.member_registration_fee_to_club !== 'number' ||
            typeof body.maximum_monthly_emails !== 'number' ||
            typeof body.fee_per_email_to_club !== 'number' ||
            typeof body.free_email_limit !== 'number'
        ) {
            return createResponse(400, { message: "member_registration_fee_to_club, maximum_monthly_emails, fee_per_email_to_club, free_email_limit must be of type number." }, origin)
        }

        const club_name = await queryItems(
            process.env.CLUB_TABLE_NAME as string,
            "club_name = :club_name",
            { ":club_name": body.club_name },
            process.env.CLUB_NAME_INDEX as string
        );
        if (club_name) {
            return createResponse(400, { message: `Club name, ${body.club_name}, is already associated with a club.` }, origin);
        }

        const club_account_id = generate_club_Id(body.club_name);

        let club_email = ""
        if (body.club_from_email.includes('@')) {
            club_email = body.club_from_email
        } else {
            club_email = `${body.club_from_email}-no-reply@${process.env.DOMAIN}`
        }

        const club_from_email = await queryItems(
            process.env.CLUB_TABLE_NAME as string,
            "club_from_email = :club_from_email",
            { ":club_from_email": club_email },
            process.env.CLUB_FROM_EMAIL_INDEX as string
        );
        if (club_from_email) {
            return createResponse(400, { message: `Club from email, ${club_email}, is already associated with a club.` }, origin);
        }

        EMAIL_TEMPLATE.registration_submission_email_template_body
            .replace(/{{club_name}}/g, body.club_name)
            .replace(/{{club_email}}/g, body.support_email)
        
        EMAIL_TEMPLATE.registration_success_email_template_body
            .replace(/{{club_name}}/g, body.club_name)
            .replace(/{{club_email}}/g, body.support_email)
        const joinedEpoch = new Date().getTime();
        await addItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "support_email": body.support_email,
                "season_cycle": 1,
                "club_type": body.club_type,
                "club_from_email": club_email,
                "club_name": body.club_name,
                "club_account_id": club_account_id,
                "member_registration_fee_to_club": body.member_registration_fee_to_club,
                "maximum_monthly_emails": body.maximum_monthly_emails,
                "fee_per_email_to_club": body.fee_per_email_to_club,
                "free_email_limit": body.free_email_limit,
                "joined": joinedEpoch,
                "seasons": [
                    {
                        "start_date": joinedEpoch,
                        "end_date": null
                    }
                ],
                use_submission_email_template: false,
                use_success_email_template: false,
                deregistration_in_progress: false,
                ...EMAIL_TEMPLATE
            }
        );

        return createResponse(
            200,
            {
                message: "Successfully added club.",
                club_account_id: club_account_id
            },
            origin
        );

    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
