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

        transactions.sort((a: any, b: any) => a.date - b.date)
        const transactions_cleaned = transactions.map((tx: any) => ({
            ...tx,
            date: new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        }));

        return createResponse(200, { transactions: transactions_cleaned }, origin);


    } catch (error: any) {
        console.error('Signup error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
