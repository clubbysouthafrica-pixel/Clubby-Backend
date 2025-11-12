import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const removeItem = async (
    table_name: string, 
    keys: Record<string, string>,
    return_old_item: boolean = false
): Promise<Record<string, string> | null> => {
    if (!keys || Object.keys(keys).length === 0) {
        throw new Error("Partition key must be provided and not empty.");
    }

    try {
        const command = new DeleteItemCommand({
            TableName: table_name,
            Key: marshall(keys),
            ReturnValues: return_old_item ? "ALL_OLD" : "NONE",
        });
        console.log(`@@@ removeItem request (Table_Name: ${table_name}): `, JSON.stringify(command));
        const response = await dynamodbClient.send(command);
        console.log(`@@@ removeItem response (Table_Name: ${table_name}): `, JSON.stringify(response));

        if (return_old_item && response.Attributes) {
            return unmarshall(response.Attributes);
        }

        return null

    } catch (error) {
        throw error;
    }
};