import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const queryItems = async (
    table_name: string,
    key_condition_expression: string,
    expression_attribute_values: Record<string, string>,
    index_name?: string,
    unmarshall_item: boolean = true,
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
        console.log(`@@@ queryItems response (Table_Name: ${table_name}): `, JSON.stringify(response));

        if (!response.Items || response.Items.length === 0) {
            return null;
        }

        if (unmarshall_item) {
            return response.Items.map(item => unmarshall(item));
        }
        return response.Items;
        
    } catch (error) {
        throw error;
    }
};