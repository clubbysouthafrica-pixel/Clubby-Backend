import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, query_string_params } = deconstructEvent(event);

    try {
        if (query_string_params?.club_account_id == null || query_string_params?.transaction_id == null) {
            return createResponse(400, { message: 'club_account_id, transaction_id required.' }, origin);
        }

        const transaction = await getItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id,
                transaction_id: query_string_params.transaction_id
            }
        );

        if (transaction == null) {
            return createResponse(404, { message: 'Transaction not found.' }, origin);
        }

        const is_paid = transaction.amount_paid >= transaction.amount;

        return createResponse(200, { is_paid }, origin);
    } catch (error: any) {
        console.error('Get transaction status error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
