import jwt from "jsonwebtoken";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
    createResponse,
    getItem,
    normalizeProductTicketValidityForResponse,
    queryItems,
    deconstructEvent
} from "./function_helpers";

const s3_client = new S3Client({ region: process.env.REGION });

export const handler = async (event: any) => {
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const club_account_id = query_string_params?.club_account_id;

        if (!club_account_id || typeof club_account_id !== "string") {
            return createResponse(400, { message: "Invalid or missing club_account_id parameter." }, origin);
        }

        const club = await getItem(process.env.CLUB_TABLE_NAME as string, {
            club_account_id: club_account_id
        });
        if (!club) {
            return createResponse(404, { message: "Club not found." }, origin);
        }
        if (club?.public_shop !== true) {
            if (typeof user_id !== "string") {
                return createResponse(401, { message: "Shop is not public." }, origin);
            }

            const club_member = await getItem(process.env.CLUB_MEMBER_TABLE_NAME as string, {
                club_account_id: club_account_id,
                user_id: user_id
            });
            if (!club_member || club_member?.registered !== true) {
                return createResponse(403, { message: "You must be a member of the club to view the shop." }, origin);
            }
        }

        const products = await queryItems(
            process.env.PRODUCT_TABLE_NAME!,
            "club_account_id = :club_account_id",
            { ":club_account_id": club_account_id }
        );

        // Generate presigned URLs for product images
        const productsWithImages = await Promise.all(
            (products || []).map(async (product: any) => {
                if (product.product_image_key) {
                    try {
                        await s3_client.send(
                            new HeadObjectCommand({
                                Bucket: process.env.SHOP_IMAGES_BUCKET_NAME,
                                Key: product.product_image_key
                            })
                        );
                        const getCommand = new GetObjectCommand({
                            Bucket: process.env.SHOP_IMAGES_BUCKET_NAME,
                            Key: product.product_image_key
                        });
                        const imageUrl = await getSignedUrl(s3_client, getCommand, { expiresIn: 60 * 5 });
                        return { ...normalizeProductTicketValidityForResponse(product), product_image_url: imageUrl };
                    } catch (err: any) {
                        const status = err?.$metadata?.httpStatusCode ?? err?.statusCode ?? err?.status;
                        if (status && status !== 404) {
                            console.error(`Error checking product image ${product.product_image_key}:`, err);
                        }
                        return normalizeProductTicketValidityForResponse(product);
                    }
                }
                return normalizeProductTicketValidityForResponse(product);
            })
        );

        return createResponse(200, { products: productsWithImages || [] }, origin);

    } catch (error: any) {
        console.error('Get club products error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};

