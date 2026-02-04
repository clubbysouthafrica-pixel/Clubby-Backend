import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (body?.club_account_id == null || body?.transaction_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id and transaction_id required in body." }, origin);
        }

        if (typeof body.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        if (typeof body.transaction_id !== 'string') {
            return createResponse(400, { message: "transaction_id must be STRING type." }, origin);
        }

        if (body?.refund_timestamp == null) {
            return createResponse(400, { message: "refund_timestamp is required in body." }, origin);
        }

        if (typeof body.refund_timestamp !== 'number') {
            return createResponse(400, { message: "refund_timestamp must be NUMBER type." }, origin);
        }
        
        await updateItem(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            {
                club_account_id: body.club_account_id,
                transaction_id: body.transaction_id
            },
            `SET #lifecycle.#ts.#refund_completed = :refund_completed`,
            {
                "#lifecycle": "lifecycle",
                "#ts": String(body.refund_timestamp),
                "#refund_completed": "refund_completed"
            },
            {
                ":refund_completed": true
            }
        );

        return createResponse(200, { message: "Refund marked as complete" }, origin);

    } catch (error: any) {
        console.error('Refund confirmation error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
