import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });

type DynamoDBKey = {
    [key: string]: { S: string } | { N: string } | { BOOL: boolean };
};


export const getItemByKey = async (
    table_name: string, 
    partition_key: DynamoDBKey, 
    sort_key?: DynamoDBKey
) => {
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