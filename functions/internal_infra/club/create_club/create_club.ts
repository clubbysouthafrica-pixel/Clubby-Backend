import { createResponse, CLUB_TYPES, addItem, deconstructEvent } from "./function_helpers";

function generate_club_Id(club_name: string): string {
    return `club_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.admin_token == null || body.admin_token !== process.env.ADMIN_TOKEN) {
            return createResponse(400, { message: 'Not authorized for admin signup.' }, origin);
        }

        if (body?.club_type == null || body?.club_name == null || body?.user_registration_fee == null) {
            return createResponse(400, { message: 'club_type, user_registration_fee and club_name required.' }, origin);
        }

        if (!CLUB_TYPES.includes(body.club_type)) {
            return createResponse(400, { message: `Invalid club_type. Valid values: ${CLUB_TYPES}.` }, origin);
        }

        if (typeof body.user_registration_fee !== 'number') {
            return createResponse(400, { message: "user_registration_fee must be of type number." }, origin)
        }

        const club_account_id = generate_club_Id(body.club_name);

        await addItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                "club_type": body.club_type,
                "club_name": body.club_name,
                "club_account_id": club_account_id
            }
        );

        await addItem(
            process.env.BILLING_TABLE_NAME as string,
            {
                "club_account_id": club_account_id,
                "outstanding_amount": 0,
                "total_amount": 0,
                "total_registered_users": 0,
                "user_registration_fee": body.user_registration_fee
            }
        )

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
