import { getItem, updateItem } from "./function_helpers";
import { validatePayFastPayment } from "./payfast_validation";

async function updateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number
) {
    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: transaction_id
        },
        `SET #amount_paid = #amount_paid + :payment_amount, #status = :status, #lifecycle.#ts = :lifecycleValue`,
        {
            "#amount_paid": "amount_paid",
            "#status": "status",
            "#lifecycle": "lifecycle",
            "#ts": `${Date.now()}`
        },
        {
            ":status": "PAID",
            ":payment_amount": payment_amount,
            ":lifecycleValue": {
                type: "CONFIRMATION",
                description: "Payment confirmation",
                amount: payment_amount,
                payment_type: "PayFast"
            }
        }
    );
}

async function updateOrdersTable(
    club_account_id: string,
    order_id: string,
    payment_amount: number
) {

    await updateItem(
        process.env.ORDERS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            order_id: order_id
        },
        "SET #amount_paid = #amount_paid + :amount_paid, #payment_status = :payment_status, #fulfillment_status = :fulfillment_status",
        {
            "#amount_paid": "amount_paid",
            "#payment_status": "payment_status",
            "#fulfillment_status": "fulfillment_status"
        },
        {
            ":amount_paid": payment_amount,
            ":payment_status": "PAID",
            ":fulfillment_status": "PROCESSING"
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
    const user_id = params.get("custom_str2") ?? undefined;
    const order_id = params.get("custom_str3") ?? undefined;

    if (!user_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!club_account_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    if (!order_id) {
        return { statusCode: 400, body: "Invalid payment" };
    }

    const order = await getItem(
        process.env.ORDERS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            order_id: order_id
        }
    );
    if (order == null) {
        return { statusCode: 400, body: "Invalid payment" };
    }
    const amount_paid = order.total_amount - order.amount_paid;

    const isValid = await validatePayFastPayment(
        {
            headers: event.headers,
            body: Object.fromEntries(new URLSearchParams(event.body)),
            connection: { remoteAddress: event.requestContext?.identity?.sourceIp },
        },
        amount_paid / 100,
        passPhrase
    );

    if (isValid) {
        console.log("✅ Payment verified successfully");

        await updateTransactionsTable(
            club_account_id,
            order.transaction_id,
            amount_paid
        );

        await updateOrdersTable(
            club_account_id,
            order_id,
            amount_paid
        );
    }

    return { statusCode: 200, body: "OK" };
};
