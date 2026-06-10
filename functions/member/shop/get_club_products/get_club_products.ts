import jwt from "jsonwebtoken";
import {
    createResponse,
    getItem,
    normalizeProductTicketValidityForResponse,
    queryItems,
    deconstructEvent
} from "./function_helpers";

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

        const productsWithImages = (products || []).map((product: any) => {
            const normalized = normalizeProductTicketValidityForResponse(product);
            if (product.product_image_key) {
                return { ...normalized, product_image_url: `${process.env.SHOP_IMAGES_CDN_URL}/${product.product_image_key}` };
            }
            return normalized;
        });

        return createResponse(200, { products: productsWithImages }, origin);

    } catch (error: any) {
        console.error('Get club products error:', error);
        const message = error?.message || "Internal Server Error";
        const statusCode = error?.$metadata?.httpStatusCode || 500;
        return createResponse(statusCode, { message }, origin);
    }
};
