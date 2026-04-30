import { deconstructEvent, createResponse, getItem, decryptData, queryItems } from './function_helpers';
import PayFast from './payfast-helper';

function roundDownToSecondDecimalPlace(amount: number): number {
    return Math.floor(amount * 100) / 100;
}

async function generateSinglePaymentUrl(amount: number, year_month: string, club_account_id: string) {

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

async function generateAllPaymentsUrl(amount: number, club_account_id: string) {

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
        item_name: `All outstanding Clubby Charges`,
        item_description: `All outstanding Clubby Charges for this club account`,
        custom_str1: club_account_id,
        custom_str2: "PAY_ALL"
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

        if ((query_string_params?.year_month == null || typeof query_string_params.year_month !== 'string') && (query_string_params?.pay_all == null || query_string_params.pay_all !== 'true')) {
            return createResponse(400, { message: "year_month (string) required or pay_all (true) required." }, origin);
        }

        if (query_string_params?.pay_all === 'true') {

            const months = await queryItems(
                process.env.MONTHLY_BILLING_TABLE_NAME as string,
                "club_account_id = :club_account_id",
                { ":club_account_id": query_string_params.club_account_id }
            );

            if (!months) {
                return createResponse(400, { message: "No billing records found for this club account." }, origin);
            }

            let amount = 0;
            for (const month of months) {
                if (month.month_paid === true) {
                    continue;
                }
                amount += month.outstanding_amount / 100;
            }

            amount = roundDownToSecondDecimalPlace(amount);

            if (amount <= 0) {
                return createResponse(400, { message: "No outstanding amount for this club account." }, origin);
            }

            return createResponse(200, { payment_url: await generateAllPaymentsUrl(amount, query_string_params.club_account_id) }, origin);

        } else {
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

            const amount = roundDownToSecondDecimalPlace((month?.outstanding_amount ?? 0) / 100);

            if (amount == null || amount <= 0) {
                return createResponse(400, { message: "No outstanding amount for this month." }, origin);
            }

            return createResponse(200, { payment_url: await generateSinglePaymentUrl(amount, query_string_params.year_month, query_string_params.club_account_id) }, origin);

        }

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: (error as Error).message }, origin);
    }
};
