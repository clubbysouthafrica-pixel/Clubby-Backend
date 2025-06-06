import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const getItemByKey = async (
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
        const response = await dynamodbClient.send(command);
    
        if (!response.Item) {
            return null;
        }
    
        return unmarshall(response.Item);
    } catch (error) {
        throw error;
    }
};