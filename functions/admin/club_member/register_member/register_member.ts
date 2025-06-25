import { 
    createResponse, 
    deconstructEvent, 
    updateItem, 
    getItem, 
    sendSqsMessage,
    FEE_TYPES
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body.member_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id, member_id requried in body." }, origin);
        }
        if (typeof body.club_account_id !== 'string' || typeof body.member_id !== 'string') {
            return createResponse(400, { message: "club_account_id, member_id must be STRING type." }, origin);
        }

        const member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                user_id: body.member_id,
                club_account_id: body.club_account_id, 
            }
        );
        if (member == null) {
            return createResponse(400, { message: "Member does not exist." }, origin);
        }

        if (member.registered) {
            return createResponse(400, { message: "Member already registered." }, origin);
        }

        const registration_billing = await getItem(
            process.env.REGISTRATION_FORM_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                field_name: member.billing_type
            }
        );

        if (registration_billing == null || !("amount" in registration_billing)) {
            return createResponse(400, { message: "Invalid billing type provided." }, origin);
        };

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
              user_id: body.member_id,
              club_account_id: body.club_account_id,
            },
            "SET #reg = :registered, #amount = #amount - :deduct_amount, #registered_on = :registered_on",
            {
              "#reg": "registered",
              "#amount": "outstanding_amount",
              "#registered_on": "registered_on"
            },
            {
              ":registered": true,
              ":deduct_amount": registration_billing.amount,
              ":registered_on": new Date().toISOString()
            }
        );

        await sendSqsMessage(
            process.env.BILLING_QUEUE_URL as string,
            {
                club_account_id: body.club_account_id,
                feeType: FEE_TYPES.USER_REGISTRATION
            },
            FEE_TYPES.USER_REGISTRATION
        )

        return createResponse(200, { message: "User successfully registered." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
