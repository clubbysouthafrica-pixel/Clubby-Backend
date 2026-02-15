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
        console.log(`@@@ queryItems request (Table_Name: ${table_name}): `, JSON.stringify(command));
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

export const queryItemsWithPagination = async (
    table_name: string,
    key_condition_expression: string,
    expression_attribute_values: Record<string, string>,
    index_name?: string,
    unmarshall_item: boolean = true,
    limit?: number,
    previousToken?: any,
    filterExpression?: string,
    expressionAttributeNames?: Record<string, string>,
) => {
    if (!expression_attribute_values || Object.keys(expression_attribute_values).length === 0) {
        throw new Error("ExpressionAttributeValues must be provided and not empty.");
    }

    try {
        const command = new QueryCommand({
            TableName: table_name,
            IndexName: index_name ?? undefined,
            KeyConditionExpression: key_condition_expression,
            ExpressionAttributeValues: marshall(expression_attribute_values),
            FilterExpression: filterExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            Limit: limit,
            ExclusiveStartKey: previousToken
        });
        console.log(`@@@ queryItemsWithPagination request (Table_Name: ${table_name}): `, JSON.stringify(command));
        const response = await dynamodbClient.send(command);
        console.log(`@@@ queryItemsWithPagination response (Table_Name: ${table_name}): `, JSON.stringify(response));

        if (!response.Items || response.Items.length === 0) {
            return { items: null, lastEvaluatedKey: response.LastEvaluatedKey };
        }

        const items = unmarshall_item ?
            response.Items.map(item => unmarshall(item)) :
            response.Items;

        return { items, lastEvaluatedKey: response.LastEvaluatedKey };
        
    } catch (error) {
        throw error;
    }
};