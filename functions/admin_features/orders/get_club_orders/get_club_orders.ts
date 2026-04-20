import { createResponse, deconstructEvent, getItem, queryItemsWithPagination } from "./function_helpers";

interface OrderFilters {
    transaction_id?: string;
    member_name?: string;
    payment_status?: string;
    fulfillment_status?: string;
}

const applyOrderFilters = (order: any, filters: OrderFilters): boolean => {
    if (filters.transaction_id && filters.transaction_id !== "all") {
        if (!order.transaction_id?.toLowerCase().includes(filters.transaction_id.toLowerCase())) {
            return false;
        }
    }

    if (filters.member_name && filters.member_name !== "all") {
        const fullName = `${order.first_name || ""} ${order.surname || ""}`.toLowerCase().trim();
        if (!fullName.includes(filters.member_name.toLowerCase())) {
            return false;
        }
    }

    if (filters.payment_status && filters.payment_status !== "all") {
        if (order.payment_status !== filters.payment_status) {
            return false;
        }
    }

    if (filters.fulfillment_status && filters.fulfillment_status !== "all") {
        if (order.fulfillment_status !== filters.fulfillment_status) {
            return false;
        }
    }

    return true;
};

export const handler = async (event: any) => {

    const { origin, query_string_params } = deconstructEvent(event);

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
            payment_status: query_string_params?.payment_status,
            fulfillment_status: query_string_params?.fulfillment_status
        };

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

            if (queryOrders == null) {
                lastEvaluatedKey = undefined;
                break;
            }

            let filteredOrders = queryOrders;
            if (Object.values(filters).some(f => f && f !== "all")) {
                filteredOrders = queryOrders.filter((order: any) => applyOrderFilters(order, filters));
            }

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
