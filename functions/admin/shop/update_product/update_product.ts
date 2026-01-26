import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent,
    updateItem
} from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.product_id || typeof body.product_id !== "string") {
            return createResponse(400, { message: "Invalid or missing product_id." }, origin);
        }

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id." }, origin);
        }

        if (body.initial_quantity === undefined && body.active_product === undefined && body.name === undefined && body.product_image === undefined) {
            return createResponse(400, { message: "At least one field to update must be provided (name, initial_quantity, active_product, or product_image)." }, origin);
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

        if (body.product_image !== undefined) {
            if (typeof body.product_image !== "string" || !body.product_image.startsWith("data:")) {
                return createResponse(400, { message: "Invalid product image provided (Must be a base64 data URL)." }, origin);
            }
        }

        // Upload product image to S3 if provided
        let imageKey: string | undefined;
        if (body.product_image) {
            try {
                const base64Data = body.product_image.split(",")[1];
                const buffer = Buffer.from(base64Data, "base64");
                const mimeMatch = body.product_image.match(/^data:(.+);base64,/);
                const contentType = mimeMatch ? mimeMatch[1] : "image/jpeg";

                imageKey = `${body.club_account_id}/${body.product_id}`;
                const command = new PutObjectCommand({
                    Bucket: process.env.SHOP_IMAGES_BUCKET_NAME,
                    Body: buffer,
                    Key: imageKey,
                    ContentEncoding: "base64",
                    ContentType: contentType,
                });
                await s3_client.send(command);
            } catch (uploadError: any) {
                console.error('Image upload error:', uploadError);
                return createResponse(500, { message: "Failed to upload product image." }, origin);
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

        if (imageKey !== undefined) {
            updateExpressions.push("#img = :img");
            expressionAttributeNames["#img"] = "product_image_key";
            expressionAttributeValues[":img"] = imageKey;
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
