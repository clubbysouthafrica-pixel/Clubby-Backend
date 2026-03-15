import { createResponse, deconstructEvent, updateItem, getItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body } = deconstructEvent(event);

    try {
        if (!Array.isArray(body.orders)) {
            return createResponse(400, { message: "Request body must be an array of order fulfillment items." }, origin);
        }

        if (body.orders.length === 0) {
            return createResponse(400, { message: "Request body cannot be empty." }, origin);
        }

        if (!body.club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        for (const item of body.orders) {
            if (!item.order_id || !item.product_id) {
                return createResponse(400, { message: "Each item must have order_id and product_id." }, origin);
            }
        }

        const updatedOrders: string[] = [];

        for (const { order_id, product_id } of body.orders) {

            const order = await getItem(
                process.env.ORDERS_TABLE_NAME as string,
                {
                    order_id: order_id,
                    club_account_id: body.club_account_id
                }
            );

            if (!order) {
                console.warn(`Order not found: ${order_id}`);
                continue;
            }

            if (!order.items || !Array.isArray(order.items)) {
                console.warn(`Order ${order_id} has no items array.`);
                continue;
            }

            const itemIndex = order.items.findIndex((item: any) => item.product_id === product_id);

            if (itemIndex === -1) {
                console.warn(`Product ${product_id} not found in order ${order_id}.`);
                continue;
            }

            const currentFulfillmentQuantity = order.items[itemIndex].fulfillment_quantity || 0;
            const updatedItems = [...order.items];
            updatedItems[itemIndex].fulfillment_quantity = currentFulfillmentQuantity + 1;

            if (updatedItems[itemIndex].fulfillment_quantity === updatedItems[itemIndex].quantity) {
                updatedItems[itemIndex].fulfillment_status = "DELIVERED";
            } else {
                updatedItems[itemIndex].fulfillment_status = "PARTIALLY_DELIVERED";
            }

            const allItemsDelivered = updatedItems.every((item: any) => item.fulfillment_quantity === item.quantity);
            const orderFulfillmentStatus = allItemsDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED";

            await updateItem(
                process.env.ORDERS_TABLE_NAME as string,
                {
                    order_id: order_id,
                    club_account_id: order.club_account_id
                },
                "SET #items = :items, #fulfillment_status = :fulfillment_status",
                {
                    "#items": "items",
                    "#fulfillment_status": "fulfillment_status"
                },
                {
                    ":items": updatedItems,
                    ":fulfillment_status": orderFulfillmentStatus
                }
            );

            updatedOrders.push(`${order_id}:${product_id}`);
        }

        return createResponse(200, {
            message: "Order fulfillment quantities updated successfully.",
            updatedCount: updatedOrders.length,
            updatedItems: updatedOrders
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
