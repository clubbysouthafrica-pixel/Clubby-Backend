import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Queue, MSC_LambdaLayer, MSC_Bucket } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_MailerConstructProps {
    api_gateway: MSC_APIGateway;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    club_table: MSC_Table;
    billing_table: MSC_Table;
    users_table: MSC_Table;
    mail_queue: MSC_Queue;
    image_bucket: MSC_Bucket;
    token_authorizer: TokenAuthorizer;
}

export class MSC_MailerConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MailerConstructProps) {
        super(scope, id);

        const process_emails = new MSC_Lambda(this, `${id}-ProcessEmails`, {
            code: "admin/mailer/process_emails",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
                REGION: process.env.REGION as string,
                SENDING_LIMIT: process.env.EMAIL_SENDING_LIMIT as string,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName,
                USERS_TABLE_NAME: props.users_table.tableName as string,
            },
            permissions: {
                ["*"]: [
                    "ses:GetSendQuota"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.image_bucket.grantPut(process_emails);

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
