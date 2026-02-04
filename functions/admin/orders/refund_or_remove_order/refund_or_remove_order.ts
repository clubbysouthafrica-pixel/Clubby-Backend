import { updateItem, createResponse, deconstructEvent, getItem } from "./function_helpers";

interface Unit {
    returnToInventory: boolean;
}

interface Item {
    product_id: string;
    name: string;
    quantity: number;
    price: number;
    units: Unit[];
    subtotal?: number;
}

interface RefundRequest {
    transaction_id: string;
    order_id: string;
    club_account_id: string;
    refund_amount: number;
    is_full_refund: boolean;
    items: Item[];
}

interface DeleteRequest {
    transaction_id: string;
    order_id: string;
    club_account_id: string;
    items: Item[];
}

type RefundOrDeleteRequest = RefundRequest | DeleteRequest;

const validateItem = (item: any): item is Item => {
    return (
        typeof item.product_id === "string" &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        typeof item.price === "number" &&
        Array.isArray(item.units) &&
        item.units.every((unit: any) => typeof unit.returnToInventory === "boolean")
    );
};

const validateRefundRequest = (body: any): body is RefundRequest => {
    return (
        typeof body.transaction_id === "string" &&
        typeof body.order_id === "string" &&
        typeof body.club_account_id === "string" &&
        typeof body.refund_amount === "number" &&
        typeof body.is_full_refund === "boolean" &&
        Array.isArray(body.items) &&
        body.items.every(validateItem)
    );
};

const validateDeleteRequest = (body: any): body is DeleteRequest => {
    return (
        typeof body.transaction_id === "string" &&
        typeof body.order_id === "string" &&
        typeof body.club_account_id === "string" &&
        Array.isArray(body.items) &&
        body.items.every(validateItem) &&
        !("refund_amount" in body)
    );
};

const parseAndValidateRequest = (body: any): { type: "refund" | "delete"; data: RefundOrDeleteRequest } | null => {
    if (typeof body !== "object" || body === null) {
        return null;
    }

    if ("refund_amount" in body) {
        if (validateRefundRequest(body)) {
            return { type: "refund", data: body };
        }
        return null;
    }

    if (validateDeleteRequest(body)) {
        return { type: "delete", data: body };
    }

    return null;
};

const handleFullOrderRefund = async (order_id: string, club_account_id: string) => {
    try {
        const order = await getItem(
            process.env.ORDERS_TABLE_NAME as string,
            { club_account_id: club_account_id, order_id: order_id }
        );

        if (!order || !order.items) {
            throw new Error(`Order ${order_id} not found or has no items`);
        }

        const updatedItems = order.items.map((item: any) => {
            if (item.quantity > 0) {
                return {
                    ...item,
                    refund_quantity: (item.refund_quantity || 0) + item.quantity,
                    quantity: 0
                };
            }
            return item;
        });

        await updateItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            },
            "SET #amount_paid = :zero, #payment_status = :payment_status, #fulfillment_status = :fulfillment_status, #items = :items",
            {
                "#amount_paid": "amount_paid",
                "#payment_status": "payment_status",
                "#fulfillment_status": "fulfillment_status",
                "#items": "items"
            },
            {
                ":zero": 0,
                ":payment_status": "REFUND",
                ":fulfillment_status": "PROCESSING",
                ":items": updatedItems
            }
        );
    } catch (error) {
        console.error("Error in handleFullOrderRefund:", error);
        throw error;
    }
};

const handleFullTransactionRefund = async (transaction_id: string, club_account_id: string, refund_amount: number) => {
    try {

        await updateItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                transaction_id: transaction_id
            },
            `SET #amount_paid = :amount_paid, #status = :status, #lifecycle.#ts = :lifecycleValue`,
            {
                "#status": "status",
                "#lifecycle": "lifecycle",
                "#amount_paid": "amount_paid",
                "#ts": `${Date.now()}`
            },
            {
                ":status": "REFUND",
                ":amount_paid": 0,
                ":lifecycleValue": {
                    type: "REFUND",
                    description: "Refund issued due to order cancellation",
                    amount: refund_amount,
                    payment_type: "REFUND",
                    refund_completed: false,
                }
            }
        );
    } catch (error) {
        console.error("Error in handleFullTransactionRefund:", error);
        throw error;
    }
};

const handleInventoryRestock = async (club_account_id: string, items: Item[]) => {
    try {
        for (const item of items) {
            const product_id = item.product_id;

            let inventory_return_amount = 0;
            for (const unit of item.units) {
                if (unit.returnToInventory) {
                    inventory_return_amount += 1;
                }
            }

            if (inventory_return_amount > 0) {
                await updateItem(
                    process.env.PRODUCT_TABLE_NAME as string,
                    {
                        club_account_id: club_account_id,
                        product_id: product_id
                    },
                    "SET #initial_quantity = #initial_quantity + :return_amount",
                    {
                        "#initial_quantity": "initial_quantity"
                    },
                    {
                        ":return_amount": inventory_return_amount
                    }
                );
            }

        }
    } catch (error) {
        console.error("Error in handleInventoryRestock:", error);
        throw error;
    }
};

const handlePartialOrderRefund = async (order_id: string, club_account_id: string, refund_amount: number, items: Item[]) => {
    try {
        const order = await getItem(
            process.env.ORDERS_TABLE_NAME as string,
            { club_account_id: club_account_id, order_id: order_id }
        );

        if (!order || !order.items) {
            throw new Error(`Order ${order_id} not found or has no items`);
        }

        const updatedItems = order.items.map((orderItem: any) => {
            const refundItem = items.find(i => i.product_id === orderItem.product_id);
            if (refundItem) {
                return {
                    ...orderItem,
                    refund_quantity: (orderItem.refund_quantity || 0) + refundItem.quantity,
                    quantity: orderItem.quantity - refundItem.quantity
                };
            }
            return orderItem;
        });

        await updateItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            },
            "SET #payment_status = :payment_status, #amount_paid = #amount_paid - :refund_amount, #items = :items",
            {
                "#payment_status": "payment_status",
                "#amount_paid": "amount_paid",
                "#items": "items"
            },
            {
                ":refund_amount": refund_amount,
                ":items": updatedItems,
                ":payment_status": "PAID (Partial Refund)"
            }
        );
    } catch (error) {
        console.error("Error in handlePartialOrderRefund:", error);
        throw error;
    }
};

const handlePartialTransactionRefund = async (transaction_id: string, club_account_id: string, refund_amount: number) => {
    try {

        await updateItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                transaction_id: transaction_id
            },
            `SET #amount_paid = #amount_paid - :refund_amount, #lifecycle.#ts = :lifecycleValue`,
            {
                "#amount_paid": "amount_paid",
                "#lifecycle": "lifecycle",
                "#ts": `${Date.now()}`
            },
            {
                ":refund_amount": refund_amount,
                ":lifecycleValue": {
                    type: "REFUND",
                    description: "Refund issued for part of the order",
                    amount: refund_amount,
                    payment_type: "REFUND",
                    refund_completed: false,
                }
            }
        );
    } catch (error) {
        console.error("Error in handlePartialTransactionRefund:", error);
        throw error;
    }
};

const handleTransactionDeletion = async (transaction_id: string, club_account_id: string) => {
    try {
        await updateItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                transaction_id: transaction_id
            },
            `SET #status = :status, #lifecycle.#ts = :lifecycleValue`,
            {
                "#status": "status",
                "#lifecycle": "lifecycle",
                "#ts": `${Date.now()}`
            },
            {
                ":status": "CANCELLED",
                ":lifecycleValue": {
                    type: "CANCELLATION",
                    description: "Transaction cancelled due to order deletion",
                    amount: "N/A",
                    payment_type: "N/A"
                }
            }
        );
    } catch (error) {
        console.error("Error in handleTransactionDeletion:", error);
        throw error;
    }
};

const handleOrderDeletion = async (order_id: string, club_account_id: string) => {
    try {
        await updateItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            },
            `SET #payment_status = :payment_status, #fulfillment_status = :fulfillment_status`,
            {
                "#payment_status": "payment_status",
                "#fulfillment_status": "fulfillment_status"
            },
            {
                ":payment_status": "CANCELLED",
                ":fulfillment_status": "CANCELLED"
            }
        );
    } catch (error) {
        console.error("Error in handleOrderDeletion:", error);
        throw error;
    }
};

export const handler = async (event: any) => {

    const { origin, query_string_params, body } = deconstructEvent(event);

    try {
        const parsedRequest = parseAndValidateRequest(body);

        if (!parsedRequest) {
            return createResponse(400, { message: "Invalid request payload" }, origin);
        }

        const { type, data } = parsedRequest;

        if (type === "refund") {
            const refundData = data as RefundRequest;

            if (refundData.is_full_refund) {
                await handleFullOrderRefund(refundData.order_id, refundData.club_account_id);
                await handleInventoryRestock(refundData.club_account_id, refundData.items);
                await handleFullTransactionRefund(refundData.transaction_id, refundData.club_account_id, refundData.refund_amount);
            } else {
                await handlePartialOrderRefund(refundData.order_id, refundData.club_account_id, refundData.refund_amount, refundData.items);
                await handleInventoryRestock(refundData.club_account_id, refundData.items);
                await handlePartialTransactionRefund(refundData.transaction_id, refundData.club_account_id, refundData.refund_amount);
            }

            return createResponse(200, { message: "Refund processed", type, order_id: refundData.order_id }, origin);
        } else {
            const deleteData = data as DeleteRequest;

            await handleInventoryRestock(deleteData.club_account_id, deleteData.items);
            await handleTransactionDeletion(deleteData.transaction_id, deleteData.club_account_id);
            await handleOrderDeletion(deleteData.order_id, deleteData.club_account_id);

            return createResponse(200, { message: "Order deleted", type, order_id: deleteData.order_id }, origin);
        }

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
