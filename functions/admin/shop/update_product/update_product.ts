import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.product_id || typeof body.product_id !== "string") {
            return createResponse(400, { message: "Invalid or missing product_id." }, origin);
        }

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id." }, origin);
        }

        if (body.initial_quantity === undefined && body.active_product === undefined && body.name === undefined) {
            return createResponse(400, { message: "At least one field to update must be provided (name, initial_quantity, or active_product)." }, origin);
        }

        if (body.name !== undefined) {
            if (typeof body.name !== "string" || body.name === "") {
                return createResponse(400, { message: "Invalid name provided (Must be a non-empty string)." }, origin);
            }
        }

        if (body.initial_quantity !== undefined) {
            if (typeof body.initial_quantity !== "number" || body.initial_quantity <= 0) {
                return createResponse(400, { message: "Invalid initial_quantity provided (Must be greater than 0)." }, origin);
            }
        }

        if (body.active_product !== undefined) {
            if (typeof body.active_product !== "boolean") {
                return createResponse(400, { message: "Invalid active_product provided (Must be a boolean)." }, origin);
            }
        }

        const updateExpressions: string[] = [];
        const expressionAttributeValues: Record<string, any> = {};
        const expressionAttributeNames: Record<string, string> = {};

        if (body.name !== undefined) {
            updateExpressions.push("#n = :n");
            expressionAttributeNames["#n"] = "name";
            expressionAttributeValues[":n"] = body.name;
        }

        if (body.initial_quantity !== undefined) {
            updateExpressions.push("#iq = :iq");
            expressionAttributeNames["#iq"] = "initial_quantity";
            expressionAttributeValues[":iq"] = body.initial_quantity;
        }

        if (body.active_product !== undefined) {
            updateExpressions.push("#ap = :ap");
            expressionAttributeNames["#ap"] = "active_product";
            expressionAttributeValues[":ap"] = body.active_product;
        }

        const updateExpression = `SET ${updateExpressions.join(", ")}`;

        const updatedProduct = await updateItem(
            process.env.PRODUCT_TABLE_NAME!,
            {
                product_id: body.product_id,
                club_account_id: body.club_account_id
            },
            updateExpression,
            expressionAttributeNames,
            expressionAttributeValues,
            undefined,
            true
        );

        return createResponse(200, { message: "Product updated successfully", product: updatedProduct }, origin);

    } catch (error: any) {
        console.error('Update product error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
