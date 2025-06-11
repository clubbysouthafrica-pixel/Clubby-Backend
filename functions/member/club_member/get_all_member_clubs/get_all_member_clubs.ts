import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const clubs = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "user_id = :user_id",
            { ":user_id": user_id as string }
        )

        if (clubs == null) {
            return createResponse(200, { items: [] }, origin);
        }

        const items = clubs.map(item => {
            delete item.user_id;
            return item;
        })

        return createResponse(200, { items }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
