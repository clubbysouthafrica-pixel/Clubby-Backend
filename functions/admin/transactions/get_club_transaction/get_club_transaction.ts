import { createResponse, deconstructEvent, queryItemsWithPagination } from "./function_helpers";
import { marshall } from "@aws-sdk/util-dynamodb";

export type StandardInputTypes = 'TEXT' | 'DROPDOWN' | 'PHONE' | 'DATE' | 'NUMBER' | 'RADIO';
export type CurrencyType = 'ZAR' | 'USD' | 'GBP'

interface TransactionFilters {
    transaction_id?: string;
    member_id?: string;
    transaction_type?: string;
    status?: string;
}

const transformTransaction = (tx: any) => {
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
};

const applyTransactionFilters = (transaction: any, filters: TransactionFilters): boolean => {
    if (filters.transaction_id) {
        if (!transaction.transaction_id?.toLowerCase().includes(filters.transaction_id.toLowerCase())) {
            return false;
        }
    }

    if (filters.member_id) {
        if (!transaction.user_id?.toLowerCase().includes(filters.member_id.toLowerCase())) {
            return false;
        }
    }

    if (filters.transaction_type) {
        if (transaction.type !== filters.transaction_type) {
            return false;
        }
    }

    if (filters.status) {
        if (transaction.status !== filters.status) {
            return false;
        }
    }

    return true;
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: 'club_account_id required.' }, origin);
        }

        const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
        const previousToken = query_string_params?.page_token ? JSON.parse(query_string_params.page_token) : undefined;
        const expressionAttributeValues = { ":clubId": query_string_params.club_account_id };

        const transactions: any[] = [];
        let currentToken = previousToken;
        let lastEvaluatedKey: any = undefined;
        const filters: TransactionFilters = body?.filters || {};

        while (true) {
            const queryResult = await queryItemsWithPagination(
                process.env.TRANSACTIONS_TABLE_NAME as string,
                "club_account_id = :clubId",
                expressionAttributeValues,
                process.env.CLUB_ACCOUNT_ID_INDEX as string,
                true,
                (limit ?? 0) - transactions.length,
                currentToken
            );

            const queryTransactions = queryResult.items;
            const queryLastEvaluatedKey = queryResult.lastEvaluatedKey;

            if (queryTransactions == null) {
                lastEvaluatedKey = undefined;
                break;
            }

            let filteredTransactions = queryTransactions;
            if (Object.keys(filters).length > 0) {
                filteredTransactions = queryTransactions.filter((tx: any) => applyTransactionFilters(tx, filters));
            }

            for (const tx of filteredTransactions) {
                transactions.push(tx);
                if (limit && transactions.length >= limit) {
                    break;
                }
            }

            if (limit && transactions.length >= limit) {
                const lastFilteredTx = filteredTransactions[filteredTransactions.length - 1];
                lastEvaluatedKey = {
                    club_account_id: { "S": lastFilteredTx.club_account_id },
                    transaction_id: { "S": lastFilteredTx.transaction_id }
                };
                break;
            }

            if (!queryLastEvaluatedKey) {
                lastEvaluatedKey = undefined;
                break;
            }

            currentToken = queryLastEvaluatedKey;
        }

        if (transactions.length === 0) {
            return createResponse(200, { transactions: [], pageToken: undefined }, origin);
        }

        transactions.sort((a: any, b: any) => b.creation_date - a.creation_date)
        const transactions_cleaned = transactions.map(transformTransaction);

        return createResponse(200, { 
            transactions: transactions_cleaned,
            pageToken: lastEvaluatedKey ? JSON.stringify(lastEvaluatedKey) : undefined
        }, origin);
    } catch (error: any) {
        console.error('Transaction fetch error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
