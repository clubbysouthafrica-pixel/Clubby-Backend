import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const queryItemsByKey = async (
    table_name: string,
    key_condition_expression: string,
    expression_attribute_values: Record<string, string>,
    index_name?: string
) => {
    if (!expression_attribute_values || Object.keys(expression_attribute_values).length === 0) {
        throw new Error("ExpressionAttributeValues must be provided and not empty.");
    }

    try {
        const command = new QueryCommand({
            TableName: table_name,
            IndexName: index_name ?? undefined,
            KeyConditionExpression: key_condition_expression,
            ExpressionAttributeValues: marshall(expression_attribute_values)
        });
        const response = await dynamodbClient.send(command);

        if (!response.Items || response.Items.length === 0) {
            return null;
        }

        return response.Items.map(item => unmarshall(item));
        
    } catch (error) {
        throw error;
    }
};