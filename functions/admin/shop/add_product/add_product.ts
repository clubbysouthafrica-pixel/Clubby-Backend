import { randomUUID } from "crypto";
import {
    createResponse,
    deconstructEvent,
    queryItems,
    addItem
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid club_account_id provided." }, origin);
        }

        if (!body?.name || typeof body.name !== "string") {
            return createResponse(400, { message: "Invalid name provided." }, origin);
        }

        if (!body?.price || typeof body.price !== "number" || body.price <= 0) {
            return createResponse(400, { message: "Invalid price provided (Must be greater than 0)." }, origin);
        }

        if (!body?.initial_quantity || typeof body.initial_quantity !== "number" || body.initial_quantity <= 0) {
            return createResponse(400, { message: "Invalid Initial Quantity provided (Must be greater than 0)." }, origin);
        }

        if (body?.active_product === undefined || body?.purchase_limit === undefined) {
            return createResponse(400, { message: "Missing required fields: Active Product and/or Purchase Limit." }, origin);
        }

        if (typeof body.active_product !== "boolean") {
            return createResponse(400, { message: "Invalid active_product provided (Must be a boolean)." }, origin);
        }

        const product_id = randomUUID();
        const created_date = Math.floor(Date.now() / 1000);

        const productItem = {
            product_id,
            club_account_id: body.club_account_id,
            name: body.name,
            price: body.price,
            initial_quantity: body.initial_quantity,
            active_product: body.active_product,
            purchase_limit: body.purchase_limit,
            created_date,
            ...(body.description && { description: body.description })
        };

        await addItem(process.env.PRODUCT_TABLE_NAME!, productItem);

        return createResponse(200, { message: "Product added successfully", product_id }, origin);

    } catch (error: any) {
        console.error('Registration fees reporting error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
