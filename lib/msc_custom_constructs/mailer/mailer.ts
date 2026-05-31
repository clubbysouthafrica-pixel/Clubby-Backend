import { Stack, StackProps } from 'aws-cdk-lib';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { MSC_Bucket, MSC_Lambda, MSC_LambdaLayer, MSC_Queue, MSC_Table } from '../../msc_service_constructs';

const synthEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export interface MSC_MailingStackProps extends StackProps {
    mail_queue: MSC_Queue;
    billing_table: MSC_Table;
    image_bucket: MSC_Bucket;
    club_history_bucket: MSC_Bucket;
}

export class MSC_MailingStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MailingStackProps) {
        super(scope, id, props);

        const jwt_layer = new MSC_LambdaLayer(this, `${id}-JWT`, {
            code: "jwt_code",
            description: "JWT Lambda Layer"
        });

        const send_mail = new MSC_Lambda(this, `${id}-SendMail`, {
            code: "mailer/send_mail",
            envVariables: {
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                ENVIRONMENT: synthEnv.ENVIRONMENT as string,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName,
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName,
                REGION: synthEnv.REGION as string,
            },
            permissions: {
                [`arn:aws:ses:${synthEnv.REGION}:${synthEnv.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail",
                    "ses:SendRawEmail"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ] 
            },
            layers: [jwt_layer],
        });
        props.image_bucket.grantRead(send_mail);
        props.club_history_bucket.grantPut(send_mail);
        send_mail.addEventSource(new SqsEventSource(props.mail_queue, {
            batchSize: 1
        }));
    }
}