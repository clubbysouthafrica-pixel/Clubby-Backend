import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!Array.isArray(body?.refunds)) {
            return createResponse(400, { message: "Request body must contain a 'refunds' array." }, origin);
        }

        if (body.refunds.length === 0) {
            return createResponse(400, { message: "Refunds array cannot be empty." }, origin);
        }

        if (!body.club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        // Validate each refund item
        for (const refund of body.refunds) {
            if (refund?.transaction_id == null) {
                return createResponse(400, { message: "Each refund must have transaction_id." }, origin);
            }

            if (typeof refund.transaction_id !== 'string') {
                return createResponse(400, { message: "transaction_id must be STRING type." }, origin);
            }

            if (refund?.refund_timestamp == null) {
                return createResponse(400, { message: "refund_timestamp is required for each refund." }, origin);
            }

            if (typeof refund.refund_timestamp !== 'number') {
                return createResponse(400, { message: "refund_timestamp must be NUMBER type." }, origin);
            }
        }

        const completedRefunds: string[] = [];
        const failedRefunds: Array<{ transaction_id: string; error: string }> = [];

        for (const refund of body.refunds) {
            await updateItem(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                {
                    club_account_id: body.club_account_id,
                    transaction_id: refund.transaction_id
                },
                `SET #lifecycle.#ts.#refund_completed = :refund_completed`,
                {
                    "#lifecycle": "lifecycle",
                    "#ts": String(refund.refund_timestamp),
                    "#refund_completed": "refund_completed"
                },
                {
                    ":refund_completed": true
                }
            );

            completedRefunds.push(refund.transaction_id);
        }

        return createResponse(200, {
            message: "Refund confirmations processed",
            completed: completedRefunds.length,
            failed: failedRefunds.length,
            completedRefunds,
            failedRefunds
        }, origin);

    } catch (error: any) {
        console.error('Refund confirmation error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
