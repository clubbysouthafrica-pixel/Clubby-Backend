import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body } = deconstructEvent(event);

    try {

        const { order_id, club_account_id } = body;

        if (!order_id || !club_account_id) {
            return createResponse(400, { message: "order_id and club_account_id are required." }, origin);
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
                ":fulfillment_status": "RECEIVED"
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
