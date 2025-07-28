import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dynamodbClient = new DynamoDBClient({ region: process.env.REGION });


export const scanItems = async (
    table_name: string,
    unmarshall_item: boolean = true,
) => {
    try {
        const command = new ScanCommand({
            TableName: table_name
        });
        console.log(`@@@ scanItems request (Table_Name: ${table_name}): `, JSON.stringify(command));
        const response = await dynamodbClient.send(command);
        console.log(`@@@ scanItems response (Table_Name: ${table_name}): `, JSON.stringify(response));

        if (!response.Items || response.Items.length === 0) {
            return [];
        }

        if (unmarshall_item) {
            return response.Items.map(item => unmarshall(item));
        }
        return response.Items;
        
    } catch (error) {
        throw error;
    }
};