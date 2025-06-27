import { createResponse, deconstructEvent, getItem, updateItem } from "./function_helpers";

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

    const requiredFields = ["first_name", "surname", "date_of_birth", "phone_number"];
    const missingFields = requiredFields.filter((field) => !body?.[field]);

    if (missingFields.length > 0) {
      return createResponse(
        400,
        { message: `Missing required fields: ${missingFields.join(", ")}` },
        origin
      );
    }

    const invalidStringFields = requiredFields.filter(
      field => typeof body[field] !== "string"
    );

    if (invalidStringFields.length > 0) {
      return createResponse(
        400,
        { message: `These fields must be strings: ${invalidStringFields.join(", ")}` },
        origin
      );
    }

    if (!isValidPhoneNumber(body.phone_number)) {
      return createResponse(400, { message: "Invalid phone number format. Use format like +27727187281" }, origin);
    }

    if (!isValidDateOfBirth(body.date_of_birth)) {
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

    if (user != null && "first_name" in user) {
      return createResponse(
        400,
        { message: "User already onboarded." },
        origin
      );
    }

    const updatableFields = [
      "first_name",
      "surname",
      "date_of_birth",
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

    update_expressions.push("#onboarded = :onboarded");
    expression_attribute_names["#onboarded"] = "onboarded";
    expression_attribute_values[":onboarded"] = true;

    const update_expression = `SET ${update_expressions.join(", ")}`;

    try {
      await updateItem(
        process.env.USERS_TABLE_NAME as string,
        key,
        update_expression,
        expression_attribute_names,
        expression_attribute_values,
        "attribute_exists(user_type) AND attribute_exists(user_id)",
        true
      )

      return createResponse(200, { message: "User onboarded successfully." }, origin);
    } catch (error: any) {
      if (error.name === "ConditionalCheckFailedException") {
        return createResponse(404, { message: "User does not exist" }, origin);
      }

      throw error;
    }
  } catch (error) {
    console.error("Error:", error);
    return createResponse(500, { message: "Internal Server Error" }, origin);
  }
};
