import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const addItem = async (
    table_name: string, 
    item: Record<string, any>,
    condition_expression?: string,
) => {
    if (!item || Object.keys(item).length === 0) {
        throw new Error("Item cannot empty.");
    }

    try {
        const request = {
            TableName: table_name,
            Item: item,
            ConditionExpression: condition_expression ?? undefined,
        }
        console.log(`@@@ addItem request (Table_Name: ${table_name}): `, JSON.stringify(request));
        const command = new PutItemCommand({
            TableName: table_name,
            Item: marshall(item),
            ConditionExpression: condition_expression ?? undefined,
        });
        const response = await dynamodbClient.send(command);
        console.log(`@@@ addItem response (Table_Name: ${table_name}): `, JSON.stringify(response));
    } catch (error) {
        throw error;
    }
};