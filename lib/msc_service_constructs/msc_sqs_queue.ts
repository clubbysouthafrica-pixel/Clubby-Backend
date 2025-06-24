import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

interface MSC_QueueProps {
    queue_name: string;
    timeout?: number;
}

export class MSC_Queue extends Queue {
    constructor(scope: Construct, id: string, props: MSC_QueueProps) {
        super(scope, `${id}-FifoQueue`, {
            queueName: `${props.queue_name}.fifo`,
            visibilityTimeout: Duration.seconds(props.timeout ?? 30),
            fifo: true,
            contentBasedDeduplication: true,
            retentionPeriod: Duration.days(1)
        })
    }
}
