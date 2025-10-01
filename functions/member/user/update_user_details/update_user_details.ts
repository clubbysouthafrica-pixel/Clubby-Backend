import { createResponse, deconstructEvent, getItem, queryItems, updateItem } from "./function_helpers";

const isValidDateOfBirth = (dob: string): boolean => {
    const regex = /^\d{4}\/\d{2}\/\d{2}$/;

    if (!regex.test(dob)) return false;

    const [year, month, day] = dob.split("/").map(Number);
    const date = new Date(`${year}-${month}-${day}`);

    return (
        date.getFullYear() === year &&
        date.getMonth() + 1 === month &&
        date.getDate() === day
    );
};

const isValidPhoneNumber = (phone: string): boolean => {
    const regex = /^\+\d{10,15}$/;
    return regex.test(phone);
};

export const handler = async (event: any) => {

    const { origin, body, query_string_params, user_id } = deconstructEvent(event);

    try {

        body["phone_number"] = body["phone_number"].replace(/\s+/g, '');
        
        if (body.phone_number && !isValidPhoneNumber(body.phone_number)) {
            return createResponse(400, { message: "Invalid phone number format. Use format like +27727187281" }, origin);
        }

        if (body.date_of_birth && !isValidDateOfBirth(body.date_of_birth)) {
            return createResponse(
                400,
                { message: "Invalid date of birth. Use format yyyy/mm/dd" },
                origin
            );
        }

        const key = {
            user_type: process.env.USER_TYPE as string,
            user_id: user_id as string,
        };

        const user = await getItem(
            process.env.USERS_TABLE_NAME as string,
            key
        );

        if (user == null) {
            return createResponse(
                400,
                { message: "User does not exist." },
                origin
            );
        } else if (!user?.onboarded) {
            return createResponse(
                400,
                { message: "User must be onboarded." },
                origin
            );
        }

        const updatableFields = [
            "first_name",
            "surname",
            "date_of_birth",
            "country",
            "address_line_1",
            "address_line_2",
            "suburb",
            "city",
            "phone_number",
            "postal_code",
        ];

        const update_expressions: string[] = [];
        const expression_attribute_names: Record<string, string> = {};
        const expression_attribute_values: Record<string, string | boolean | number> = {};

        for (const field of updatableFields) {
            if (body[field] !== undefined && body[field] !== null) {
                const placeholder = `#${field}`;
                const valueKey = `:${field}`;
                update_expressions.push(`${placeholder} = ${valueKey}`);
                expression_attribute_names[placeholder] = field;
                expression_attribute_values[valueKey] = body[field];
            }
        }

        const update_expression = `SET ${update_expressions.join(", ")}`;

        try {
            await updateItem(
                process.env.USERS_TABLE_NAME as string,
                key,
                update_expression,
                expression_attribute_names,
                expression_attribute_values
            )

            if (body["first_name"] && body["surname"]) {
                const club_members = await queryItems(
                    process.env.CLUB_MEMBER_TABLE_NAME as string,
                    "user_id = :userId",
                    { ":userId": user_id as string }
                )

                if (!club_members) return createResponse(200, { message: "User details updated successfully." }, origin);

                for (const member of club_members) {
                    await updateItem(
                        process.env.CLUB_MEMBER_TABLE_NAME as string,
                        {
                            user_id: user_id as string,
                            club_account_id: member.club_account_id
                        },
                        `SET #member_first_name = :first_name, #member_surname = :surname`,
                        {
                            "#member_first_name": "member_first_name",
                            "#member_surname": "member_surname"
                        }, 
                        {
                            ":first_name": body["first_name"],
                            ":surname": body["surname"]
                        }
                    )
                }
            }

            return createResponse(200, { message: "User details updated successfully." }, origin);
        } catch (error: any) {
            throw error;
        }
    } catch (error: any) {
        console.error("Error:", error);
        return createResponse(500, { message: error.message }, origin);
    }
};
