import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_LambdaLayer, MSC_Table, MSC_Cognito, MSC_Queue } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { Stack } from "aws-cdk-lib";

interface MSC_PayfastConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    registrations_table: MSC_Table;
    club_member_table: MSC_Table;
    transactions_table: MSC_Table;
    user_pool: MSC_Cognito;
    club_table: MSC_Table;
    users_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        axios_layer: MSC_LambdaLayer;
    };
    billing_table: MSC_Table;
    mail_queue: MSC_Queue;
}

export class MSC_PayfastConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_PayfastConstructProps) {
        super(scope, id);

        const region = Stack.of(this).region;
        const account = Stack.of(this).account;
        const ssmParamArn = `arn:aws:ssm:${region}:${account}:parameter/payfast_details_*`;

        const get_checkout_url = new MSC_Lambda(this, `${id}-GetCheckoutUrl`, {
            code: "member/payfast/get_checkout_url",
            envVariables: {
                DOMAIN: process.env.ENVIRONMENT === "Dev" ? "http://localhost:5173" : `https://${process.env.DOMAIN}` as string,
                NOTIFY_URL: `https://member.${process.env.DOMAIN}/payfast/handlePayment`,
                USERS_TABLE_NAME: props.users_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [ssmParamArn]: [
                    "ssm:GetParameter"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.axios_layer]
        });

        const handle_payment = new MSC_Lambda(this, `${id}-HandlePayment`, {
            code: "member/payfast/handle_payment",
            envVariables: {
                USER_POOL_ID: props.user_pool.userPoolId,
                ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_NAME_INDEX: "ClubNameIndex",
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:AdminGetUser"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [`${props.club_table.tableArn}/index/ClubNameIndex`]: [
                    "dynamodb:Query"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.axios_layer]
        });

        const pay_fast_resource = props.api_gateway.root.addResource("payfast");

        const get_checkout_url_resource = pay_fast_resource.addResource("checkoutUrl");
        const handle_payment_resource = pay_fast_resource.addResource("handlePayment");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_checkout_url_resource, get_checkout_url, methodOptions, undefined, "GET");
        addCorsEnabledMethod(handle_payment_resource, handle_payment, { methodResponses: [] }, undefined, "POST");
    }
}
