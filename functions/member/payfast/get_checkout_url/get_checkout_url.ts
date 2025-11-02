import { deconstructEvent, createResponse, getItem } from './function_helpers';
import PayFast from './payfast';

const config = {
    sandbox: true,
    merchant_id: "10043297",
    merchant_key: "5uv9um9zkr99m"
}

const pf = new PayFast(config);

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null || typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id (string) required." }, origin);
        }

        const user = await getItem(
            process.env.USERS_TABLE_NAME as string,
            {
                user_type: "MEMBER",
                user_id: user_id as string,
            }
        );
        if (user == null) {
            return createResponse(400, { message: "User not found." }, origin);
        }

        const club_member = await getItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                user_id: user_id as string
            }
        );
        if (club_member == null) {
            return createResponse(400, { message: "Club member not found." }, origin);
        }

        const registration = await getItem(process.env.REGISTRATIONS_TABLE_NAME as string, {
            user_id: user_id as string,
            registration_id: club_member.current_reg_id
        });
        if (registration == null) {
            return createResponse(400, { message: "Registration not found." }, origin);
        }

        const paymentData = {
            return_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            cancel_url: `${process.env.DOMAIN}/clubs/${query_string_params.club_account_id}`,
            notify_url: process.env.NOTIFY_URL,
            name_first: user.first_name,
            name_last: user.surname,
            // custom_str1: club_member.club_name,
            email_address: user.email,
            amount: registration?.total_outstanding_amount / 100,
            item_name: 'Registration Fee',
            item_description: club_member.club_name,
        };

        const urlString = pf.createStringfromObject(paymentData);
        const hash = pf.createSignature(urlString);
        const paymentObject = pf.createPaymentObject(paymentData, hash);
        const generatePaymentUrl = await pf.generatePaymentUrl(paymentObject);

        return createResponse(200, { payment_url: generatePaymentUrl }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
