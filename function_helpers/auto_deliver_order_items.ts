import { getItem } from "./database_functions/get_item";
import { updateItem } from "./database_functions/update_item";

export const autoDeliverOrderItems = async (
    order: Record<string, any>,
    ordersTableName: string,
    productTableName: string,
): Promise<void> => {
    if (!Array.isArray(order?.items) || order.items.length === 0) {
        return;
    }

    const productCache = new Map<string, Record<string, any> | null>();
    for (const item of order.items) {
        if (!productCache.has(item.product_id)) {
            const product = await getItem(productTableName, {
                product_id: item.product_id,
                club_account_id: order.club_account_id,
            });
            productCache.set(item.product_id, product);
        }
    }

    let hasChanges = false;
    const updatedItems = order.items.map((item: any) => {
        const product = productCache.get(item.product_id);
        if (product?.auto_deliver === true) {
            hasChanges = true;
            return { ...item, fulfillment_quantity: item.quantity, fulfillment_status: "DELIVERED" };
        }
        return item;
    });

    if (!hasChanges) {
        return;
    }

    const allDelivered = updatedItems.every((item: any) => item.fulfillment_quantity === item.quantity);

    await updateItem(
        ordersTableName,
        { order_id: order.order_id, club_account_id: order.club_account_id },
        "SET #items = :items, #fulfillment_status = :fulfillment_status",
        { "#items": "items", "#fulfillment_status": "fulfillment_status" },
        { ":items": updatedItems, ":fulfillment_status": allDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED" }
    );
};
