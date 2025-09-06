import { createResponse, CLUB_TYPES, addItem, deconstructEvent, queryItems } from "./function_helpers";

function generate_club_Id(club_name: string): string {
    return `club_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
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
            return createResponse(400, {message: `Club name, ${body.club_name}, is already associated with a club.`}, origin);
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
            return createResponse(400, {message: `Club from email, ${club_email}, is already associated with a club.`}, origin);
        }

        await addItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "support_email": body.support_email,
                "club_type": body.club_type,
                "club_from_email": club_email,
                "club_name": body.club_name,
                "club_account_id": club_account_id,
                "member_registration_fee_to_club": body.member_registration_fee_to_club,
                "maximum_monthly_emails": body.maximum_monthly_emails,
                "fee_per_email_to_club": body.fee_per_email_to_club,
                "free_email_limit": body.free_email_limit
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
