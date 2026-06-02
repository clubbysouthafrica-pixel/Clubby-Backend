import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
    createResponse,
    deconstructEvent,
    normalizeProductTicketValidityForResponse,
    updateItem,
    resolveProductTicketValidityForStorage
} from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

const isValidProductType = (value: unknown): value is "standard" | "ticket" => value === "standard" || value === "ticket";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        if (!body?.product_id || typeof body.product_id !== "string") {
            return createResponse(400, { message: "Invalid or missing product_id." }, origin);
        }

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id." }, origin);
        }

        if (body.name !== undefined) {
            if (typeof body.name !== "string" || body.name === "") {
                return createResponse(400, { message: "Invalid name provided (Must be a non-empty string)." }, origin);
            }
        }

        if (body.active_product !== undefined) {
            if (typeof body.active_product !== "boolean") {
                return createResponse(400, { message: "Invalid active_product provided (Must be a boolean)." }, origin);
            }
        }

        if (body.product_type !== undefined && !isValidProductType(body.product_type)) {
            return createResponse(400, { message: "Invalid product_type provided (Must be 'standard' or 'ticket')." }, origin);
        }

        const ticketValidityResolution = resolveProductTicketValidityForStorage(body ?? {});
        if (ticketValidityResolution.error) {
            return createResponse(400, { message: ticketValidityResolution.error }, origin);
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

        const setExpressions: string[] = [];
        const removeExpressions = new Set<string>(ticketValidityResolution.removeAttributes);
        const expressionAttributeValues: Record<string, any> = {};
        const expressionAttributeNames: Record<string, string> = {};

        if (body.name !== undefined) {
            setExpressions.push("#n = :n");
            expressionAttributeNames["#n"] = "name";
            expressionAttributeValues[":n"] = body.name;
        }

        if (body.active_product !== undefined) {
            setExpressions.push("#ap = :ap");
            expressionAttributeNames["#ap"] = "active_product";
            expressionAttributeValues[":ap"] = body.active_product;
        }

        if (body.product_type !== undefined) {
            setExpressions.push("#pt = :pt");
            expressionAttributeNames["#pt"] = "product_type";
            expressionAttributeValues[":pt"] = body.product_type;
        }

        if (ticketValidityResolution.fields.valid_day_start_date !== undefined) {
            setExpressions.push("#vdsd = :vdsd");
            expressionAttributeNames["#vdsd"] = "valid_day_start_date";
            expressionAttributeValues[":vdsd"] = ticketValidityResolution.fields.valid_day_start_date;
        }

        if (ticketValidityResolution.fields.valid_day_end_date !== undefined) {
            setExpressions.push("#vded = :vded");
            expressionAttributeNames["#vded"] = "valid_day_end_date";
            expressionAttributeValues[":vded"] = ticketValidityResolution.fields.valid_day_end_date;
        }

        if (ticketValidityResolution.fields.excluded_valid_day_options !== undefined) {
            setExpressions.push("#evdo = :evdo");
            expressionAttributeNames["#evdo"] = "excluded_valid_day_options";
            expressionAttributeValues[":evdo"] = ticketValidityResolution.fields.excluded_valid_day_options;
        }

        if (imageKey !== undefined) {
            setExpressions.push("#img = :img");
            expressionAttributeNames["#img"] = "product_image_key";
            expressionAttributeValues[":img"] = imageKey;
        }

        for (const attributeName of removeExpressions) {
            const attributeKey = `#${attributeName.replace(/_/g, "")}`;
            expressionAttributeNames[attributeKey] = attributeName;
        }

        if (setExpressions.length === 0 && removeExpressions.size === 0) {
            return createResponse(400, { message: "No valid product fields were provided for update." }, origin);
        }

        const expressionParts: string[] = [];
        if (setExpressions.length > 0) {
            expressionParts.push(`SET ${setExpressions.join(", ")}`);
        }
        if (removeExpressions.size > 0) {
            const removeAttributeKeys = Array.from(removeExpressions).map((attributeName) => `#${attributeName.replace(/_/g, "")}`);
            expressionParts.push(`REMOVE ${removeAttributeKeys.join(", ")}`);
        }
        const updateExpression = expressionParts.join(" ");

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

        if (!updatedProduct) {
            return createResponse(500, { message: "Product update did not return the updated product." }, origin);
        }

        return createResponse(200, { message: "Product updated successfully", product: normalizeProductTicketValidityForResponse(updatedProduct) }, origin);

    } catch (error: any) {
        console.error('Update product error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
