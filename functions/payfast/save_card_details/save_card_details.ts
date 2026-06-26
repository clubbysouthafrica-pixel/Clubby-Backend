import { deconstructEvent, createResponse, getItem } from './function_helpers';
import PayFast from './payfast-helper';

export const handler = async (event: any) => {

    const { origin, user_id, query_string_params } = deconstructEvent(event);

    try {
        const config: {
            merchant_id: string;
            merchant_key: string;
            passphrase?: string;
            environment: string;
        } = {
            merchant_id: process.env.MERCHANT_ID as string,
            merchant_key: process.env.MERCHANT_KEY as string,
            passphrase: process.env.PASSPHRASE as string,
            environment: `${process.env.ENVIRONMENT === "Dev" ? "sandbox" : "Prod"}`,
        };

        const payfast = new PayFast(config);

        const paymentData = {
            return_url: process.env.RETURN_URL as string,
            cancel_url: process.env.CANCEL_URL as string,
            notify_url: process.env.NOTIFY_URL as string,

            name_first: query_string_params.first_name,
            name_last: query_string_params.surname,
            email_address: query_string_params.email,

            m_payment_id: query_string_params.club_account_id,

            amount: "1.00",
            item_name: "Card Registration",

            payment_method: "cc",
            subscription_type: "2",
        };

        const queryString = payfast.createStringfromObject(paymentData);
        const signature = payfast.createSignature(queryString);
        const paymentObject = payfast.createPaymentObject(paymentData, signature);
        const redirectUrl = await payfast.generatePaymentUrl(paymentObject);

        console.log("Generated PayFast tokenization URL:", redirectUrl);

        return createResponse(200, { redirectUrl }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: (error as Error).message }, origin);
    }
};
