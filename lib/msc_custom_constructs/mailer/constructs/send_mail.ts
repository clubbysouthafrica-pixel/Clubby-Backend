import { Construct } from "constructs";
import { MSC_Lambda, MSC_Queue } from "../../../msc_service_constructs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface MSC_SendEmailConstructProps { }

export class MSC_SendEmailConstruct extends Construct {
    public readonly mail_queue: MSC_Queue;
    constructor(scope: Construct, id: string, props: MSC_SendEmailConstructProps) {
        super(scope, id);

        this.mail_queue = new MSC_Queue(this, `${id}-Mail`, {
            queue_name: 'SendMail'
        });

        const send_mail = new MSC_Lambda(this, id, {
            code: "mailer/send_mail",
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ]
            }
        });
        send_mail.addEventSource(new SqsEventSource(this.mail_queue, {
            batchSize: 1
        }));
    }
}
