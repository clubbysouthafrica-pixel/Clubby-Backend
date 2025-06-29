import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Bucket, MSC_Table, MSC_Queue } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_MailerConstructProps {
    api_gateway: MSC_APIGateway;
    layers: MSC_Layers;
    club_table: MSC_Table;
    mail_queue: MSC_Queue;
    token_authorizer: TokenAuthorizer;
}

export class MSC_MailerConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MailerConstructProps) {
        super(scope, id);

        const process_emails = new MSC_Lambda(this, `${id}-ProcessEmails`, {
            code: "admin/mailer/process_emails",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
                REGION: process.env.REGION as string,
                SENDING_LIMIT: '1',
            },
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:GetSendQuota"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const mailer_resource = props.api_gateway.root.addResource("mailer");

        const process_emails_resource = mailer_resource.addResource("processEmails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(process_emails_resource, process_emails, methodOptions);
    }
}
