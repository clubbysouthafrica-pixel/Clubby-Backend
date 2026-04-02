import { deconstructEvent, createResponse, getItem, decryptData } from './function_helpers';
import PayFast from './payfast-helper';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm_client = new SSMClient({ region: process.env.REGION });

async function generatePaymentUrl(amount: number, year_month: string, club_account_id: string) {

    const club = await getItem(
        process.env.CLUB_TABLE_NAME as string,
        {
            club_account_id: club_account_id
        }
    );

    const config: {
        merchant_id: string;
        merchant_key: string;
        passphrase?: string;
        environment: string;
    } = {
        merchant_id: process.env.MERCHANT_ID as string,
        merchant_key: process.env.MERCHANT_KEY as string,
        environment: `${process.env.ENVIRONMENT === "Dev" ? "sandbox" : "Prod"}` as string,
    }

    const pf = new PayFast(config);
    const paymentData = {
        return_url: `${process.env.DOMAIN}/billing&usage`,
        cancel_url: `${process.env.DOMAIN}/billing&usage`,
        notify_url: process.env.NOTIFY_URL as string,
        name_first: club?.club_name,
        name_last: "",
        email_address: club?.support_email,
        amount: amount,
        item_name: `Clubby Charges for month: ${year_month}`,
        item_description: `Clubby Charges for month: ${year_month}`,
        custom_str1: club_account_id,
        custom_str2: year_month
    };

    const urlString = pf.createStringfromObject(paymentData);
    const hash = pf.createSignature(urlString);
    const paymentObject = pf.createPaymentObject(paymentData, hash);
    const generatePaymentUrl = await pf.generatePaymentUrl(paymentObject);

    console.log("Generated PayFast payment URL:", generatePaymentUrl);

    return generatePaymentUrl;
}

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null || typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id (string) required." }, origin);
        }

        if (query_string_params?.year_month == null || typeof query_string_params.year_month !== 'string') {
            return createResponse(400, { message: "year_month (string) required." }, origin);
        }

        const month = await getItem(
            process.env.MONTHLY_BILLING_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                year_month: query_string_params.year_month
            }
        );

        if (month?.month_paid === true) {
            return createResponse(400, { message: "This month's bill has already been paid." }, origin);
        }

        const amount = month?.total_amount / 100;

        if (amount == null || amount <= 0) {
            return createResponse(400, { message: "No outstanding amount for this month." }, origin);
        }

        return createResponse(200, { payment_url: await generatePaymentUrl(amount, query_string_params.year_month, query_string_params.club_account_id) }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: (error as Error).message }, origin);
    }
};
