import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const getItem = async (
    table_name: string, 
    keys: Record<string, string>,
) => {
    if (!keys || Object.keys(keys).length === 0) {
        throw new Error("Partition key must be provided and not empty.");
    }

    try {
        const command = new GetItemCommand({
            TableName: table_name,
            Key: marshall(keys)
        });
        console.log(`@@@ getItem request (Table_Name: ${table_name}): `, JSON.stringify(command));
        const response = await dynamodbClient.send(command);
        console.log(`@@@ getItem response (Table_Name: ${table_name}): `, JSON.stringify(response));
    
        if (!response.Item) {
            return null;
        }
    
        return unmarshall(response.Item);
    } catch (error) {
        throw error;
    }
};