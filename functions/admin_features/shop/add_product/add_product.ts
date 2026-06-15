import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import {
    createResponse,
    deconstructEvent,
    addItem,
    resolveProductTicketValidityForStorage
} from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

const isValidProductType = (value: unknown): value is "standard" | "ticket" => value === "standard" || value === "ticket";

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (!body?.club_account_id || typeof body.club_account_id !== "string") {
            return createResponse(400, { message: "Invalid club_account_id provided." }, origin);
        }

        if (!body?.name || typeof body.name !== "string") {
            return createResponse(400, { message: "Invalid name provided." }, origin);
        }

        if (body?.price === undefined || body?.price === null || typeof body.price !== "number" || body.price < 0) {
            return createResponse(400, { message: "Invalid price provided (Must be 0 or greater)." }, origin);
        }

        if (body?.active_product === undefined || body?.purchase_limit === undefined) {
            return createResponse(400, { message: "Missing required fields: Active Product and/or Purchase Limit." }, origin);
        }

        if (typeof body.active_product !== "boolean") {
            return createResponse(400, { message: "Invalid active_product provided (Must be a boolean)." }, origin);
        }

        if (body.product_type !== undefined && !isValidProductType(body.product_type)) {
            return createResponse(400, { message: "Invalid product_type provided (Must be 'standard' or 'ticket')." }, origin);
        }

        if (body.auto_deliver !== undefined && typeof body.auto_deliver !== "boolean") {
            return createResponse(400, { message: "Invalid auto_deliver provided (Must be a boolean)." }, origin);
        }

        const ticketValidityResolution = resolveProductTicketValidityForStorage(body ?? {});
        if (ticketValidityResolution.error) {
            return createResponse(400, { message: ticketValidityResolution.error }, origin);
        }

        if (body.product_image !== undefined) {
            if (typeof body.product_image !== "string" || !body.product_image.startsWith("data:")) {
                return createResponse(400, { message: "Invalid product_image provided (Must be a base64 data URL)." }, origin);
            }
        }

        const product_id = randomUUID();
        const created_date = Math.floor(Date.now() / 1000);

        let product_image_key: string | undefined;
        if (body.product_image) {
            try {
                const base64Data = body.product_image.split(",")[1];
                const buffer = Buffer.from(base64Data, "base64");
                const mimeMatch = body.product_image.match(/^data:(.+);base64,/);
                const contentType = mimeMatch ? mimeMatch[1] : "image/jpeg";

                product_image_key = `${body.club_account_id}/${product_id}`;
                const command = new PutObjectCommand({
                    Bucket: process.env.SHOP_IMAGES_BUCKET_NAME,
                    Body: buffer,
                    Key: product_image_key,
                    ContentEncoding: "base64",
                    ContentType: contentType,
                });
                await s3_client.send(command);
            } catch (uploadError: any) {
                console.error('Image upload error:', uploadError);
                return createResponse(500, { message: "Failed to upload product image." }, origin);
            }
        }

        const productItem = {
            product_id,
            club_account_id: body.club_account_id,
            name: body.name,
            price: body.price,
            active_product: body.active_product,
            product_type: body.product_type ?? "standard",
            purchase_limit: body.purchase_limit,
            created_date,
            ...ticketValidityResolution.fields,
            ...(body.description && { description: body.description }),
            ...(product_image_key && { product_image_key }),
            auto_deliver: body.auto_deliver ?? false
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
