import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const removeItem = async (
    table_name: string, 
    keys: Record<string, string>,
) => {
    if (!keys || Object.keys(keys).length === 0) {
        throw new Error("Partition key must be provided and not empty.");
    }

    try {
        const command = new DeleteItemCommand({
            TableName: table_name,
            Key: marshall(keys)
        });
        console.log(`@@@ removeItem request (Table_Name: ${table_name}): `, JSON.stringify(command));
        const response = await dynamodbClient.send(command);
        console.log(`@@@ removeItem response (Table_Name: ${table_name}): `, JSON.stringify(response));
    } catch (error) {
        throw error;
    }
};