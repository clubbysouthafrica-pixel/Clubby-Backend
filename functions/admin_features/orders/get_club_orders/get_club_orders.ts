import { createResponse, deconstructEvent, getItem, queryItemsWithPagination } from "./function_helpers";

interface OrderFilters {
    transaction_id?: string;
    member_name?: string;
    payment_status?: string[];
    fulfillment_status?: string[];
}

const getMultiValueFilter = (
    key: string,
    query_string_params?: Record<string, string>,
    multi_value_query_string_params?: Record<string, string[]>,
): string[] | undefined => {
    const values = multi_value_query_string_params?.[key]
        ?? (query_string_params?.[key] ? [query_string_params[key]] : undefined);

    if (!values) {
        return undefined;
    }

    const normalized_values = values.filter((value): value is string => Boolean(value && value !== "all"));

    return normalized_values.length > 0 ? normalized_values : undefined;
};

const applyOrderFilters = (order: any, filters: OrderFilters): boolean => {
    if (filters.transaction_id && filters.transaction_id !== "all") {
        if (!order.transaction_id?.toLowerCase().includes(filters.transaction_id.toLowerCase())) {
            console.log("Order excluded by transaction_id filter", {
                order_id: order.order_id,
                order_transaction_id: order.transaction_id,
                filter_transaction_id: filters.transaction_id
            });
            return false;
        }
    }

    if (filters.member_name && filters.member_name !== "all") {
        const fullName = `${order.first_name || ""} ${order.surname || ""}`.toLowerCase().trim();
        if (!fullName.includes(filters.member_name.toLowerCase())) {
            console.log("Order excluded by member_name filter", {
                order_id: order.order_id,
                order_member_name: fullName,
                filter_member_name: filters.member_name.toLowerCase()
            });
            return false;
        }
    }

    if (filters.payment_status && !filters.payment_status.includes(order.payment_status)) {
        console.log("Order excluded by payment_status filter", {
            order_id: order.order_id,
            order_payment_status: order.payment_status,
            filter_payment_statuses: filters.payment_status
        });
        return false;
    }

    if (filters.fulfillment_status && !filters.fulfillment_status.includes(order.fulfillment_status)) {
            console.log("Order excluded by fulfillment_status filter", {
                order_id: order.order_id,
                order_fulfillment_status: order.fulfillment_status,
                filter_fulfillment_statuses: filters.fulfillment_status
            });
            return false;
    }

    console.log("Order matched filters", {
        order_id: order.order_id,
        order_payment_status: order.payment_status,
        order_fulfillment_status: order.fulfillment_status
    });

    return true;
};

export const handler = async (event: any) => {

    const { origin, query_string_params } = deconstructEvent(event);
    const multi_value_query_string_params = event.multiValueQueryStringParameters;
    try {

        if (!query_string_params?.club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id
            }
        );
        if (!club) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const payment_methods = [
            "EFT/Cash",
            ...(club?.custom_payment_methods?.map((pm: { name: string, url: string }) => pm.name) || [])
        ]

        const limit = query_string_params?.limit ? parseInt(query_string_params.limit) : undefined;
        const previousToken = query_string_params?.pageToken ? JSON.parse(decodeURIComponent(query_string_params.pageToken)) : undefined;
        const expressionAttributeValues = { ":clubId": query_string_params.club_account_id };

        const orders: any[] = [];
        let currentToken = previousToken;
        let lastEvaluatedKey: any = undefined;

        // Extract filters from query_string_params
        const filters: OrderFilters = {
            transaction_id: query_string_params?.transaction_id,
            member_name: query_string_params?.member_name,
            payment_status: getMultiValueFilter(
                "payment_status",
                query_string_params,
                multi_value_query_string_params,
            ),
            fulfillment_status: getMultiValueFilter(
                "fulfillment_status",
                query_string_params,
                multi_value_query_string_params,
            )
        };

        console.log("Resolved order filters", {
            query_string_params,
            multi_value_query_string_params,
            filters
        });

        while (true) {
            const queryResult = await queryItemsWithPagination(
                process.env.ORDERS_TABLE_NAME as string,
                "club_account_id = :clubId",
                expressionAttributeValues,
                process.env.CLUB_ACCOUNT_ID_INDEX as string,
                true,
                (limit ?? 0) - orders.length,
                currentToken
            );

            const queryOrders = queryResult.items;
            const queryLastEvaluatedKey = queryResult.lastEvaluatedKey;

            console.log("Fetched orders page", {
                fetched_count: queryOrders?.length ?? 0,
                currentToken,
                queryLastEvaluatedKey
            });

            if (queryOrders == null) {
                lastEvaluatedKey = undefined;
                break;
            }

            let filteredOrders = queryOrders.filter((order: any) => order.ttl == null);
            if (Object.values(filters).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value && value !== "all"))) {
                filteredOrders = filteredOrders.filter((order: any) => applyOrderFilters(order, filters));
            }

            console.log("Filtered orders page", {
                fetched_count: queryOrders.length,
                filtered_count: filteredOrders.length,
                filtered_order_ids: filteredOrders.map((order: any) => order.order_id)
            });

            let lastAddedOrder: any = undefined;
            for (const order of filteredOrders) {
                orders.push(order);
                lastAddedOrder = order;
                if (limit && orders.length >= limit) {
                    break;
                }
            }

            if (limit && orders.length >= limit) {
                lastEvaluatedKey = {
                    club_account_id: { "S": lastAddedOrder.club_account_id },
                    order_id: { "S": lastAddedOrder.order_id }
                };
                break;
            }

            if (!queryLastEvaluatedKey) {
                lastEvaluatedKey = undefined;
                break;
            }

            currentToken = queryLastEvaluatedKey;
        }

        const response: any = {
            orders: orders,
            payment_methods: payment_methods,
            shop_enabled: club?.enable_shop ?? false
        };

        if (lastEvaluatedKey) {
            response.pageToken = encodeURIComponent(JSON.stringify(lastEvaluatedKey));
        }

        return createResponse(200, response, origin);

    } catch (error: any) {
        console.error("Error:", error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
