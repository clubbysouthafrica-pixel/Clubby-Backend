import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body } = deconstructEvent(event);

    try {

        const { order_id, club_account_id, type } = body;

        if (!order_id || !club_account_id || !type) {
            return createResponse(400, { message: "order_id, club_account_id, and type are required." }, origin);
        }

        if (type !== "REFUNDED" && type !== "DELIVERED") {
            return createResponse(400, { message: "Type must be either 'REFUNDED' or 'DELIVERED'." }, origin);
        }

        await updateItem(
            process.env.ORDERS_TABLE_NAME as string,
            {
                order_id: order_id,
                club_account_id: club_account_id
            },
            "SET #fulfillment_status = :fulfillment_status",
            {
                "#fulfillment_status": "fulfillment_status"
            },
            {
                ":fulfillment_status": type
            }
        );

        return createResponse(200, {
            message: "Order fulfillment status updated successfully."
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
