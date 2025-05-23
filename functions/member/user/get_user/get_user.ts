import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { createResponse } from "./function_helpers";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

export const handler = async (event: any) => {
    console.log(`EVENT @ ${new Date()}: `, event);
    const origin = event.headers.origin;
    console.log(`Called by origin: ${origin}`)

    try {
        const body = JSON.parse(event.body);

        if (body?.user_id == null) {
            return createResponse(400, { message: "user_id required." }, origin);
        }

        const command = new GetItemCommand({
            TableName: process.env.USERS_TABLE_NAME,
            Key: {
                user_type: { S: process.env.USER_TYPE as string },
                user_id: { S: body.user_id }
            }
        });
        const response = await dynamodbClient.send(command);

        if (!response.Item) {
            return createResponse(200, { message: "User not found" }, origin);
        }

        const item = unmarshall(response.Item);

        return createResponse(200, { 
            user_id: item["user_id"],
            onboarded: item["onboarded"],
            address_line_1: "address_line_1" in item ? item["address_line_1"] : undefined,
            address_line_2: "address_line_2" in item ? item["address_line_2"] : undefined,
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
