import { randomUUID } from "crypto";
import {
    createResponse,
    deconstructEvent,
    updateItem,
    addItem,
    getItem
} from "./function_helpers";

async function addToTransactionsTable(
    club_account_id: string,
    first_name: string,
    surname: string,
    transaction_id: string,
    user_id: string,
    order_amount: number,
    order_id: string
) {
    await addItem(
        process.env.TRANSACTIONS_TABLE_NAME as string,
        {
            club_account_id: club_account_id,
            name: `${first_name} ${surname}`,
            transaction_id: transaction_id,
            order_id: order_id,
            user_id: user_id as string,
            amount_paid: 0,
            club_income: true,
            amount: order_amount,
            creation_date: Date.now(),
            lifecycle: {
                [Date.now()]: {
                    description: "Order submission",
                    amount: order_amount,
                    type: "SUBMISSION"
                }
            },
            type: "ORDER",
            status: "PENDING"
        }
    )
}

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id." }, origin);
        }

        if (!Array.isArray(body?.items) || body.items.length === 0) {
            return createResponse(400, { message: "Invalid or empty items array." }, origin);
        }

        if (typeof body?.total_amount !== "number" || body.total_amount <= 0) {
            return createResponse(400, { message: "Invalid total_amount provided." }, origin);
        }

        if (typeof body?.total_items !== "number" || body.total_items <= 0) {
            return createResponse(400, { message: "Invalid total_items provided." }, origin);
        }

        const user = await getItem(
            process.env.USERS_TABLE_NAME as string,
            {
                user_type: "MEMBER",
                user_id: user_id as string,
            }
        );

        if (!user) {
            return createResponse(400, { message: "User not found." }, origin);
        }

        for (const item of body.items) {
            if (!item.product_id || !item.name || typeof item.price !== "number" ||
                typeof item.quantity !== "number" || item.quantity <= 0) {
                return createResponse(400, { message: "Invalid item in items array." }, origin);
            }
        }

        const successfulUpdates: Array<{ product_id: string; quantity: number }> = [];

        for (const item of body.items) {
            try {
                await updateItem(
                    process.env.PRODUCT_TABLE_NAME!,
                    {
                        club_account_id: body.club_account_id,
                        product_id: item.product_id
                    },
                    "SET #initial_quantity = #initial_quantity - :qty",
                    {
                        "#initial_quantity": "initial_quantity"
                    },
                    { ":qty": item.quantity },
                    "#initial_quantity >= :qty",
                    false
                );
                successfulUpdates.push({ product_id: item.product_id, quantity: item.quantity });
            } catch (error: any) {
                console.error(`Product update error for ${item.product_id}:`, error);
                if (error.name === 'ConditionalCheckFailedException') {
                    for (const rollback of successfulUpdates) {
                        try {
                            await updateItem(
                                process.env.PRODUCT_TABLE_NAME!,
                                {
                                    club_account_id: body.club_account_id,
                                    product_id: rollback.product_id
                                },
                                "SET #initial_quantity = #initial_quantity + :qty",
                                {
                                    "#initial_quantity": "initial_quantity"
                                },
                                { ":qty": rollback.quantity }
                            );
                        } catch (rollbackError) {
                            console.error(`Rollback failed for product ${rollback.product_id}:`, rollbackError);
                        }
                    }
                    return createResponse(400, { message: `Insufficient inventory for product ${item.name}.` }, origin);
                }
                throw error;
            }
        }

        const order_id = randomUUID();
        const created_date = Math.floor(Date.now() / 1000);

        const transaction_id = randomUUID();

        const orderItem = {
            order_id,
            transaction_id,
            first_name: user.first_name,
            surname: user.surname,
            club_account_id: body.club_account_id,
            user_id: user_id as string,
            items: body.items,
            total_amount: body.total_amount,
            total_items: body.total_items,
            payment_status: "PENDING",
            fulfillment_status: "NOT_PROCESSED",
            order_confirmed_by_admin: false,
            created_date,
            amount_paid: 0
        };

        await addItem(process.env.ORDER_TABLE_NAME!, orderItem);
        await addToTransactionsTable(
            body.club_account_id,
            user.first_name,
            user.surname,
            transaction_id,
            user_id as string,
            body.total_amount,
            order_id
        );

        return createResponse(200, { message: "Order created successfully. Please return to the Shop to view your order and pay.", order_id }, origin);

    } catch (error: any) {
        console.error('Create order error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
