import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }

        const transactions = await queryItems(
            process.env.TRANSACTIONS_TABLE_NAME as string,
            "club_account_id = :clubId",
            { ":clubId": query_string_params.club_account_id }
        )

        if (transactions == null) {
            return createResponse(200, { transactions: [] }, origin);
        }

        transactions.sort((a: any, b: any) => b.date - a.date)
        const transactions_cleaned = transactions.map((tx: any) => {
            const dateObj = new Date(tx.date);

            const formattedDate = dateObj.toLocaleDateString('en-GB');
            const formattedTime = dateObj.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            }).replace(' ', '');

            return {
                ...tx,
                date: `${formattedDate} ${formattedTime}`,
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
