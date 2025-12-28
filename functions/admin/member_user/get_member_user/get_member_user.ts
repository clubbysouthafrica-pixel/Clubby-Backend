import { createResponse, deconstructEvent, getItem, decryptData } from "./function_helpers";

export const handler = async (event: any) => {
    
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        if (query_string_params.member_user_id == null) {
            return createResponse(400, { message: "member_user_id required." }, origin);
        }
        if (typeof query_string_params.member_user_id !== "string") {
            return createResponse(400, { message: "member_user_id must be string." }, origin);
        }

        const item = await getItem(process.env.USERS_TABLE_NAME as string, {
            user_type: process.env.USER_TYPE as string,
            user_id: query_string_params.member_user_id
        });

        if (item == null) {
            return createResponse(200, { message: "User not found" }, origin);
        }

        return createResponse(200, { 
            address_line_1: "address_line_1" in item ? await decryptData(item["address_line_1"]) : undefined,
            address_line_2: "address_line_2" in item ? await decryptData(item["address_line_2"]) : undefined,
            phone_number: "phone_number" in item ? await decryptData(item["phone_number"]) : undefined,
            city: "city" in item ? item["city"] : undefined,
            date_of_birth: "date_of_birth" in item ? await decryptData(item["date_of_birth"]) : undefined,
            email: "email" in item ? item["email"] : undefined,
            postal_code: "postal_code" in item ? item["postal_code"] : undefined,
            suburb: "suburb" in item ? item["suburb"] : undefined
         }, origin);

    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
