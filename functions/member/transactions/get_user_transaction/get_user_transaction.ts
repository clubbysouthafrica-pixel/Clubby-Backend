import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null || query_string_params?.user_id == null) {
            return createResponse(400, { message: 'club_account_id, user_id required.' }, origin);
        }

        const transactions = await queryItems(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            "club_account_id = :clubId AND user_id = :userId",
            {
                ":clubId": query_string_params.club_account_id,
                ":userId": query_string_params.user_id
            },
            process.env.TRANSACTIONS_USER_ID_INDEX as string
        )

        if (transactions == null) {
            return createResponse(200, { transactions: [] }, origin);
        }

        transactions.sort((a: any, b: any) => b.creation_date - a.creation_date)
        const transactions_cleaned = transactions.map((tx: any) => {
            const dateObj = new Date(tx.creation_date);

            const formattedDate = dateObj.toLocaleDateString('en-GB');
            const formattedTime = dateObj.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            }).replace(' ', '');

            const outstanding_amount = tx.amount - tx.amount_paid
            delete tx.amount
            delete tx.amount_paid
            return {
                ...tx,
                creation_date: `${formattedDate} ${formattedTime}`,
                outstanding_amount
            };
        });

        return createResponse(200, { transactions: transactions_cleaned }, origin);
    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
