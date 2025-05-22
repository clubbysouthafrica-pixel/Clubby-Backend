import { DynamoDBClient, UpdateItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
  console.log(`EVENT @ ${new Date()}: `, event);
  const origin = event.headers.origin;
  console.log(`Called by origin: ${origin}`);

  try {
    const body = JSON.parse(event.body);

    const requiredFields = ["user_id", "user_type", "first_name", "surname", "date_of_birth", "email"];
    const missingFields = requiredFields.filter((field) => !body?.[field]);

    if (missingFields.length > 0) {
      return createResponse(
        400,
        { message: `Missing required fields: ${missingFields.join(", ")}` },
        origin
      );
    }

    const key = {
      user_type: { S: body.user_type },
      user_id: { S: body.user_id },
    };

    const updatableFields = [
      "first_name",
      "surname",
      "date_of_birth",
      "email",
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

      return createResponse(200, { message: "Item updated", item: response.Attributes }, origin);
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
