import { Stack, StackProps } from 'aws-cdk-lib';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { MSC_Lambda, MSC_Queue } from '../../msc_service_constructs';

export interface MSC_MailingStackProps extends StackProps {
    mail_queue: MSC_Queue;
}

export class MSC_MailingStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_MailingStackProps) {
        super(scope, id, props);

        const send_mail = new MSC_Lambda(this, `${id}-SendMail`, {
            code: "mailer/send_mail",
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ]
            }
        });
        send_mail.addEventSource(new SqsEventSource(props.mail_queue, {
            batchSize: 1
        }));
    }
}