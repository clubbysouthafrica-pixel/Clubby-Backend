import { createResponse, deconstructEvent, getItem } from "./function_helpers";

export const handler = async (event: any) => {
    
    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        const item = await getItem(process.env.USERS_TABLE_NAME as string, {
            user_type: process.env.USER_TYPE as string,
            user_id: user_id as string
        });

        if (item == null) {
            return createResponse(200, { message: "User not found" }, origin);
        }

        return createResponse(200, { 
            user_id: item["user_id"],
            onboarded: item["onboarded"],
            address_line_1: "address_line_1" in item ? item["address_line_1"] : undefined,
            address_line_2: "address_line_2" in item ? item["address_line_2"] : undefined,
            phone_number: "phone_number" in item ? item["phone_number"] : undefined,
            city: "city" in item ? item["city"] : undefined,
            date_of_birth: "date_of_birth" in item ? item["date_of_birth"] : undefined,
            email: "email" in item ? item["email"] : undefined,
            first_name: "first_name" in item ? item["first_name"] : undefined,
            postal_code: "postal_code" in item ? item["postal_code"] : undefined,
            suburb: "suburb" in item ? item["suburb"] : undefined,
            surname: "surname" in item ? item["surname"] : undefined
         }, origin);
    } catch (error) {
        console.error("Error:", error);
        return createResponse(500, { message: "Internal Server Error" }, origin);
    }
};
