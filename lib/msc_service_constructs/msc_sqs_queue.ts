import { Duration } from "aws-cdk-lib";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

interface MSC_QueueProps {
    queue_name: string;
    timeout?: number;
}

export class MSC_Queue extends Queue {
    constructor(scope: Construct, id: string, props: MSC_QueueProps) {
        super(scope, `${id}-FifoQueue`, {
            ...(process.env.ENVIRONMENT !== 'Dev' && { queueName: `${process.env.ENVIRONMENT}-${props.queue_name}.fifo`.toLowerCase() }),
            visibilityTimeout: Duration.seconds(props.timeout ?? 30),
            fifo: true,
            contentBasedDeduplication: true,
            retentionPeriod: Duration.days(1)
        })
    }
}
