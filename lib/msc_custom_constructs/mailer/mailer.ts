import { Stack, StackProps } from 'aws-cdk-lib';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { MSC_Lambda, MSC_LambdaLayer, MSC_Queue, MSC_Table } from '../../msc_service_constructs';

export interface MSC_MailingStackProps extends StackProps {
    mail_queue: MSC_Queue;
    billing_table: MSC_Table;
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
                ENVIRONMENT: process.env.ENVIRONMENT as string
            },
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ] 
            },
            layers: [jwt_layer],
        });
        send_mail.addEventSource(new SqsEventSource(props.mail_queue, {
            batchSize: 1
        }));
    }
}