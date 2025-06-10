import { createResponse, deconstructEvent, scanItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {
        const clubs = await scanItems(process.env.CLUB_TABLE_NAME as string)

        let items: any[] = [];
        items = clubs.map((item) => {
            return {
                club_name: item.club_name,
                club_account_id: item.club_account_id,
                club_type: item.club_type
            };
        });

        return createResponse(200, { items }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
