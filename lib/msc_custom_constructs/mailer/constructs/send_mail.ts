import { Construct } from "constructs";
import { MSC_Lambda, MSC_Queue, MSC_Table } from "../../../msc_service_constructs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_SendEmailConstructProps {
    layers: MSC_Layers;
}

export class MSC_SendEmailConstruct extends Construct {
    public readonly mail_queue: MSC_Queue;
    constructor(scope: Construct, id: string, props: MSC_SendEmailConstructProps) {
        super(scope, id);

        this.mail_queue = new MSC_Queue(this, `${id}-Mail`, {
            queue_name: 'Mail'
          });

        const send_mail = new MSC_Lambda(this, `${id}-SendMail`, {
            code: "mailer/send_mail",
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        send_mail.addEventSource(new SqsEventSource(this.mail_queue, {
            batchSize: 1
        }));
    }
}
