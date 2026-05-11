import { updateItem, createResponse, deconstructEvent } from "./function_helpers";

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

interface DeleteRequest {
    transaction_id: string;
    order_id: string;
    club_account_id: string;
}

const validateItem = (item: any): item is Item => {
    return (
        typeof item.product_id === "string" &&
        typeof item.name === "string" &&
        typeof item.quantity === "number" &&
        typeof item.price === "number"
    );
};

const validateDeleteRequest = (body: any): body is DeleteRequest => {
    return (
        typeof body.transaction_id === "string" &&
        typeof body.order_id === "string" &&
        typeof body.club_account_id === "string"
    );
};

const parseAndValidateRequest = (body: any): DeleteRequest | null => {
    if (typeof body !== "object" || body === null) {
        return null;
    }

    if (validateDeleteRequest(body)) {
        return body;
    }

    return null;
};

const handleTransactionCancellation = async (transaction_id: string, club_account_id: string) => {
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
        console.error("Error in handleTransactionCancellation:", error);
        throw error;
    }
};

const handleOrderCancellation = async (order_id: string, club_account_id: string) => {
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
        console.error("Error in handleOrderCancellation:", error);
        throw error;
    }
};

export const handler = async (event: any) => {

    const { origin, body } = deconstructEvent(event);

    try {
        const parsedRequest = parseAndValidateRequest(body);

        if (!parsedRequest) {
            return createResponse(400, { message: "Invalid request payload" }, origin);
        }

        await handleTransactionCancellation(parsedRequest.transaction_id, parsedRequest.club_account_id);
        await handleOrderCancellation(parsedRequest.order_id, parsedRequest.club_account_id);

        return createResponse(200, { message: "Order cancelled.", order_id: parsedRequest.order_id }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
