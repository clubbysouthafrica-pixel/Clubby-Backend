import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { FEE_TYPES } from "../constants"

const client = new SQSClient({ region: process.env.REGION });

export const sendSqsMessage = async (
    queue_url: string,
    message_body: Record<string, string>,
    group_id: string,
) => {
    if (!message_body || Object.keys(message_body).length === 0) {
        throw new Error("Message body cannot empty.");
    }

    const deduplicate_id = Date.now().toString()

    try {


        const command = new SendMessageCommand({
            QueueUrl: queue_url,
            MessageBody: JSON.stringify(message_body),
            MessageGroupId: group_id,
            MessageDeduplicationId: deduplicate_id
        }); 
        console.log(`@@@ sendSqsMessage request (Queue_URL: ${queue_url}): `, JSON.stringify(command));
        const response = await client.send(command);
        console.log(`@@@ sendSqsMessage response (Queue_URL: ${queue_url}): `, JSON.stringify(response));

    } catch (error) {
        throw error;
    }
};