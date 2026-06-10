import {
    createResponse,
    deconstructEvent,
    getItem
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, query_string_params } = deconstructEvent(event, false);

    try {
        const club_account_id = query_string_params?.club_account_id;
        const order_id = query_string_params?.order_id;

        if (!club_account_id || typeof club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id parameter." }, origin);
        }

        if (!order_id || typeof order_id !== "string") {
            return createResponse(400, { message: "Invalid or missing order_id parameter." }, origin);
        }

        const order = await getItem(process.env.ORDERS_TABLE_NAME!, {
            club_account_id,
            order_id
        });

        if (!order) {
            return createResponse(404, { message: "Order not found." }, origin);
        }

        return createResponse(200, { order }, origin);

    } catch (error: any) {
        console.error('Get public order error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
