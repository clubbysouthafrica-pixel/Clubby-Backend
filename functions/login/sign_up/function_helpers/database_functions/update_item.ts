import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const updateItem = async (
    table_name: string,
    key: Record<string, string>,
    update_expression: string,
    expression_attribute_values: Record<string, string>,
    expression_attribute_names: Record<string, string>,
    condition_expression: string,
    return_values: boolean = false,
) => {
    if (!expression_attribute_values || Object.keys(expression_attribute_values).length === 0) {
        throw new Error("ExpressionAttributeValues must be provided and not empty.");
    }

    try {
        const command = new UpdateItemCommand({
            TableName: table_name,
            Key: marshall(key),
            UpdateExpression: update_expression,
            ExpressionAttributeNames: expression_attribute_names,
            ConditionExpression: condition_expression,
            ReturnValues: return_values ? "ALL_NEW" : undefined
        });
        const response = await dynamodbClient.send(command);
        console.log(`@@@ updateItems response (Table_Name: ${table_name}): `, JSON.stringify(response));

        if (return_values) {
            return response;
        }
        
    } catch (error) {
        throw error;
    }
};