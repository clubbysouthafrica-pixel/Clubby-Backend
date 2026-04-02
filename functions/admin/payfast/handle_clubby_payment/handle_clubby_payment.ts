import { addItem, getItem, updateItem } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";
import { randomUUID } from "crypto";

async function addToTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    amount: number,
    year_month: string
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: "Clubby",
            club_income: false,
            transaction_id: transaction_id,
            amount: amount,
            creation_date: Date.now(),
            lifecycle: {
                [Date.now()]: {
                    description: `Clubby charges for month: ${year_month}`,
                    amount: amount,
                    type: "CONFIRMATION"
                }
            },
            type: "CLUBBY",
            status: "PAID"
        }
    )
}

async function updateMonthlyBillingTable(
    club_account_id: string,
    year_month: string,
    payment_amount: number
) {

    await updateItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        },
        "SET #outstanding_amount = #outstanding_amount - :payment_amount, #month_paid = :month_paid, #payment_date = :payment_date",
        {
            "#outstanding_amount": "outstanding_amount",
            "#month_paid": "month_paid",
            "#payment_date": "payment_date"
        },
        {
            ":payment_amount": payment_amount,
            ":month_paid": true,
            ":payment_date": Date.now()
        }
    );
}

export const handler = async (event: any) => {
    console.log('Received event:', JSON.stringify(event));
    const passPhrase = process.env.PAYFAST_PASSPHRASE;

    const bodyString = event.body || "";
    console.log('Event Body:', bodyString);
    const params = new URLSearchParams(bodyString);

    const club_account_id = params.get("custom_str1") ?? undefined;
    const year_month = params.get("custom_str2") ?? undefined;

    if (!club_account_id) {
        return { statusCode: 200, body: "Invalid payment" };
    }
    if (!year_month) {
        return { statusCode: 200, body: "Invalid payment" };
    }

    const month = await getItem(
        process.env.MONTHLY_BILLING_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            year_month: year_month
        }
    );

    if (month == null || month.month_paid === true) {
        return { statusCode: 200, body: "Invalid payment" };
    }
    
    const amount_to_be_paid = month.total_amount;

    const isValid = await validatePayFastPayment(
        {
            headers: event.headers,
            body: Object.fromEntries(new URLSearchParams(event.body)),
            connection: { remoteAddress: event.requestContext?.identity?.sourceIp },
        },
        amount_to_be_paid / 100,
        passPhrase
    );

    if (isValid) {
        console.log("✅ Payment verified successfully");

         const transaction_id = randomUUID();

        await addToTransactionsTable(
            club_account_id,
            transaction_id,
            amount_to_be_paid,
            year_month
        );

        await updateMonthlyBillingTable(
            club_account_id,
            year_month,
            amount_to_be_paid
        );
    }

    return { statusCode: 200, body: "OK" };
};
