import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { AttributeValue } from "@aws-sdk/client-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

type DynamoDBKey = Record<string, AttributeValue>;


export const getItemByKey = async (
    table_name: string, 
    partition_key: DynamoDBKey, 
    sort_key?: DynamoDBKey
) => {
    if (!partition_key || Object.keys(partition_key).length === 0) {
        throw new Error("Partition key must be provided and not empty.");
    }

    try {
        const command = new GetItemCommand({
            TableName: table_name,
            Key: {
                ...partition_key,
                ...sort_key
            }
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