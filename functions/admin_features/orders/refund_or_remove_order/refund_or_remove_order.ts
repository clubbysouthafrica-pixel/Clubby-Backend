import { updateItem, createResponse, deconstructEvent, getItem } from "./function_helpers";

interface Item {
    product_id: string;
    name: string;
    quantity: number;
    price: number;
    subtotal?: number;
    units?: Array<{
        is_delivered: boolean;
    }>;
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
        typeof item.price === "number"
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

        const updatedItems = order.items.map((orderItem: any) => {
            if (orderItem.quantity > 0) {
                return {
                    ...orderItem,
                    refund_quantity: (orderItem.refund_quantity || 0) + orderItem.quantity,
                    fulfillment_quantity: 0,
                    quantity: 0
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
                ":fulfillment_status": "REFUNDED",
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
                const deliveredUnitsCount = refundItem.units ? refundItem.units.filter(u => u.is_delivered).length : 0;
                
                return {
                    ...orderItem,
                    refund_quantity: (orderItem.refund_quantity || 0) + refundItem.quantity,
                    fulfillment_quantity: Math.max(0, (orderItem.fulfillment_quantity || 0) - deliveredUnitsCount),
                    quantity: orderItem.quantity - refundItem.quantity
                };
            }
            return orderItem;
        });

        const allItemsDelivered = updatedItems.every((item: any) => item.fulfillment_quantity === item.quantity);
        const allItemsNotDelivered = updatedItems.every((item: any) => item.fulfillment_quantity === 0);

        let fulfillmentStatus = "PARTIALLY_DELIVERED";
        if (allItemsNotDelivered) {
            fulfillmentStatus = "PROCESSING";
        } else if (allItemsDelivered) {
            fulfillmentStatus = "DELIVERED";
        }

        await updateItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            },
            "SET #payment_status = :payment_status, #amount_paid = #amount_paid - :refund_amount, #items = :items, #fulfillment_status = :fulfillment_status",
            {
                "#payment_status": "payment_status",
                "#amount_paid": "amount_paid",
                "#items": "items",
                "#fulfillment_status": "fulfillment_status"
            },
            {
                ":refund_amount": refund_amount,
                ":items": updatedItems,
                ":payment_status": "PAID (Partial Refund)",
                ":fulfillment_status": fulfillmentStatus
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
            `SET #amount_paid = #amount_paid - :refund_amount, #status = :status, #lifecycle.#ts = :lifecycleValue`,
            {
                "#amount_paid": "amount_paid",
                "#status": "status",
                "#lifecycle": "lifecycle",
                "#ts": `${Date.now()}`
            },
            {
                ":refund_amount": refund_amount,
                ":status": "PAID (Partial Refund)",
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
                await handleFullTransactionRefund(refundData.transaction_id, refundData.club_account_id, refundData.refund_amount);
            } else {
                await handlePartialOrderRefund(refundData.order_id, refundData.club_account_id, refundData.refund_amount, refundData.items);
                await handlePartialTransactionRefund(refundData.transaction_id, refundData.club_account_id, refundData.refund_amount);
            }

            return createResponse(200, { message: "Refund processed", type, order_id: refundData.order_id }, origin);
        } else {
            const deleteData = data as DeleteRequest;

            await handleTransactionDeletion(deleteData.transaction_id, deleteData.club_account_id);
            await handleOrderDeletion(deleteData.order_id, deleteData.club_account_id);

            return createResponse(200, { message: "Order deleted", type, order_id: deleteData.order_id }, origin);
        }

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
