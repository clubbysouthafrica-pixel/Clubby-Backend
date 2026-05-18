import { removeItem, createResponse, deconstructEvent } from "./function_helpers";

interface DeleteRequest {
    transaction_id: string;
    order_id: string;
    club_account_id: string;
}

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

const handleTransactionDeletion = async (transaction_id: string, club_account_id: string) => {
    try {
        await removeItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                transaction_id: transaction_id
            }
        );
    } catch (error) {
        console.error("Error in handleTransactionDeletion:", error);
        throw error;
    }
};

const handleOrderDeletion = async (order_id: string, club_account_id: string) => {
    try {
        await removeItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                club_account_id: club_account_id,
                order_id: order_id
            }
        );
    } catch (error) {
        console.error("Error in handleOrderDeletion:", error);
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

        await handleTransactionDeletion(parsedRequest.transaction_id, parsedRequest.club_account_id);
        await handleOrderDeletion(parsedRequest.order_id, parsedRequest.club_account_id);

        return createResponse(200, { message: "Order cancelled.", order_id: parsedRequest.order_id }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
