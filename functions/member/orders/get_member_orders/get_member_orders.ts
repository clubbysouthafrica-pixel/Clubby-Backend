import {
    createResponse,
    deconstructEvent,
    queryItems
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!user_id) {
            return createResponse(400, { message: "User ID not found in token." }, origin);
        }

        const club_account_id = query_string_params?.club_account_id;

        if (!club_account_id || typeof club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id parameter." }, origin);
        }

        const orders = await queryItems(
            process.env.ORDERS_TABLE_NAME!,
            "user_id = :user_id AND club_account_id = :club_account_id",
            { 
                ":user_id": user_id,
                ":club_account_id": club_account_id
            },
            process.env.ORDERS_INDEX_NAME
        );

        return createResponse(200, { orders: orders || [] }, origin);

    } catch (error: any) {
        console.error('Get member orders error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
