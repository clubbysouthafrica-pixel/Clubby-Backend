import { getItem, updateItem, createResponse, deconstructEvent } from "./function_helpers";

async function updateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number,
    payment_type: string
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
                payment_type: payment_type
            }
        }
    );
}

async function updateOrdersTable(
    club_account_id: string,
    order_id: string,
    payment_amount: number,
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

async function partiallyUpdateTransactionsTable(
    club_account_id: string,
    transaction_id: string,
    payment_amount: number,
    payment_type: string
) {

    await updateItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            transaction_id: transaction_id
        },
        `SET #amount_paid = #amount_paid + :payment_amount, #lifecycle.#ts = :lifecycleValue, #status = :status`,
        {
            "#amount_paid": "amount_paid",
            "#lifecycle": "lifecycle",
            "#ts": `${Date.now()}`,
            '#status': 'status'
        },
        {
            ":payment_amount": payment_amount,
            ":status": "PARTIALLY_PAID",
            ":lifecycleValue": {
                type: "CONFIRMATION",
                description: "Payment confirmation",
                amount: payment_amount,
                payment_type: payment_type
            }
        }
    );
}

async function partiallyUpdateOrdersTable(
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
        "SET #amount_paid = #amount_paid + :amount_paid, #payment_status = :payment_status",
        {
            "#amount_paid": "amount_paid",
            "#payment_status": "payment_status",
        },
        {
            ":amount_paid": payment_amount,
            ":payment_status": "PARTIALLY_PAID"
        }
    );
}

export const handler = async (event: any) => {
    
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const { order_id, club_account_id, transaction_id, payment_amount, payment_type } = body;

        if (!order_id || !club_account_id || !transaction_id || typeof payment_amount !== "number" || payment_amount <= 0 || !payment_type) {
            return createResponse(400, { message: "order_id, club_account_id, transaction_id, payment_amount and payment_type are required." }, origin);
        }

        const order = await getItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            }
        );
        if (!order) {
            return createResponse(400, { message: "Order not found." }, origin);
        }

        if (order.total_amount - order.amount_paid - payment_amount < 0) {
            return createResponse(400, { message: "Payment amount exceeds outstanding order amount." }, origin);
        }

        if (order.total_amount - order.amount_paid - payment_amount === 0) {
            await updateTransactionsTable(club_account_id, transaction_id, payment_amount, payment_type);
            await updateOrdersTable(club_account_id, order_id, payment_amount);

            return createResponse(200, { message: "Order payment confirmed." }, origin);
        }

        await partiallyUpdateTransactionsTable(club_account_id, transaction_id, payment_amount, payment_type);
        await partiallyUpdateOrdersTable(club_account_id, order_id, payment_amount);

        return createResponse(200, { message: "Order payment confirmed." }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
