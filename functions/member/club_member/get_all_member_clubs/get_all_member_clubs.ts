import { createResponse, deconstructEvent, queryItems } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params } = deconstructEvent(event);

    try {

        if (query_string_params?.user_id == null) {
            return createResponse(400, { message: "user_id required." }, origin);
        }
        if (typeof query_string_params.user_id !== 'string') {
            return createResponse(400, { message: "user_id must be STRING type." }, origin);
        }

        const items = await queryItems(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            "user_id = :user_id",
            { ":user_id": query_string_params.user_id }
        )

        if (items == null) {
            return createResponse(200, { items: [] }, origin);
        }

        return createResponse(200, { items }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
