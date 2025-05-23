import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

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

const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const isValidPhoneNumber = (phone: string): boolean => {
  const regex = /^\+\d{10,15}$/; // + followed by 10–15 digits
  return regex.test(phone);
};

export const handler = async (event: any) => {
  console.log(`EVENT @ ${new Date()}: `, event);
  const origin = event.headers.origin;
  console.log(`Called by origin: ${origin}`);

  try {
    const body = JSON.parse(event.body);

    const requiredFields = ["user_id", "first_name", "surname", "date_of_birth", "email", "phone_number"];
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

    if (!isValidEmail(body.email)) {
      return createResponse(
        400,
        { message: "Invalid email format" },
        origin
      );
    }

    if (!isValidDateOfBirth(body.date_of_birth)) {
      return createResponse(
        400,
        { message: "Invalid date of birth. Use format yyyy/mm/dd" },
        origin
      );
    }

    const key = {
      user_type: { S: process.env.USER_TYPE as string },
      user_id: { S: body.user_id },
    };

    const updatableFields = [
      "first_name",
      "surname",
      "date_of_birth",
      "email",
      "phone_number",
      "address_line_1",
      "address_line_2",
      "suburb",
      "city",
      "postal_code",
    ];

    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    for (const field of updatableFields) {
      if (body[field] !== undefined && body[field] !== null) {
        const placeholder = `#${field}`;
        const valueKey = `:${field}`;
        updateExpressions.push(`${placeholder} = ${valueKey}`);
        expressionAttributeNames[placeholder] = field;
        expressionAttributeValues[valueKey] = { S: body[field] };
      }
    }

    updateExpressions.push("#onboarded = :onboarded");
    expressionAttributeNames["#onboarded"] = "onboarded";
    expressionAttributeValues[":onboarded"] = { BOOL: true };

    const UpdateExpression = `SET ${updateExpressions.join(", ")}`;

    try {
      const response = await dynamodbClient.send(new UpdateItemCommand({
        TableName: process.env.USERS_TABLE_NAME,
        Key: key,
        UpdateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: "attribute_exists(user_type) AND attribute_exists(user_id)",
        ReturnValues: "ALL_NEW",
      }));

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
