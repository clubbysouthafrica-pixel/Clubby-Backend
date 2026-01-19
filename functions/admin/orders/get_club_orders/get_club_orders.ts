import { createResponse, deconstructEvent, getItem, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, query_string_params } = deconstructEvent(event);

    try {

        if (!query_string_params?.club_account_id) {
            return createResponse(400, { message: "club_account_id is required." }, origin);
        }

        const club = await getItem(
            process.env.CLUB_TABLE_NAME as string,
            {
                club_account_id: query_string_params.club_account_id
            }
        );
        if (!club) {
            return createResponse(400, { message: "Club not found." }, origin);
        }

        const payment_methods = [
            "EFT/Cash",
            ...(club?.custom_payment_methods?.map((pm: { name: string, url: string }) => pm.name) || [])
        ]

        const orders = await queryItems(
            process.env.ORDERS_TABLE_NAME!,
            "club_account_id = :club_account_id",
            {
                ":club_account_id": query_string_params.club_account_id
            }
        );

        return createResponse(200, {
            orders: orders ?? [],
            payment_methods: payment_methods
        }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
