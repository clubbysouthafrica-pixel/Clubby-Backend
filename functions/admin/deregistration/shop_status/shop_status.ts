import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "Invalid request. club_account_id required in query string." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        const orders = await queryItems(
            process.env.ORDERS_TABLE_NAME!,
            "club_account_id = :club_account_id",
            {
                ":club_account_id": query_string_params.club_account_id
            }
        );

        if (!orders || orders.length === 0) {
            return createResponse(200, { message: "Shop de-registration check passed." }, origin);
        }

        for (const order of orders) {
            if (order.payment_status === "CANCELLED" || order.payment_status === "REFUND") {
                continue;
            }
            if (order.amount_paid !== order.total_amount) {
                let refunded_amount = 0
                for (const item of order.items) {
                    refunded_amount += (item?.refund_quantity ?? 0) * (item?.price ?? 0)
                }

                if (refunded_amount + order.amount_paid !== order.total_amount) {
                    return createResponse(211, { message: "There are still orders that have pending payments. Please consolidate them before de-registering.", id: order.order_id }, origin);
                }
            }

            for (const item of order.items) {
                const fulfillment = item?.fulfillment_quantity ?? 0
                const quantity = item?.quantity ?? 0
                if (fulfillment !== quantity) {
                    return createResponse(211, { message: "There are still items that have pending fulfillments or refunds. Please resolve them before de-registering.", id: order.order_id  }, origin);
                }
            }
        }

        return createResponse(200, { message: "Shop de-registration check passed." }, origin);

    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
