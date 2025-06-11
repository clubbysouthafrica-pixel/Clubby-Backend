import { createResponse, deconstructEvent, updateItem } from "./function_helpers";

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params?.club_account_id == null) {
            return createResponse(400, { message: "club_account_id required." }, origin);
        }
        if (typeof query_string_params.club_account_id !== 'string') {
            return createResponse(400, { message: "club_account_id must be STRING type." }, origin);
        }

        await updateItem(
            process.env.CLUB_MEMBER_TABLE_NAME as string,
            { 
                user_id: user_id as string,
                club_account_id: query_string_params.club_account_id
            },
            "SET #reg = :registered",
            { "#reg": "registered" },
            { ":registered": true }
        );

        return createResponse(200, { message: "User successfully registered." }, origin);
        
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
