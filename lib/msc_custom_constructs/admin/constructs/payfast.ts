import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_LambdaLayer, MSC_Table, MSC_Kms } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { Stack } from "aws-cdk-lib";

interface MSC_PayFastConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    club_table: MSC_Table;
    billing_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        axios_layer: MSC_LambdaLayer;
    };
    kms_key: MSC_Kms;
    transactions_table: MSC_Table;
}

export class MSC_PayFastConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_PayFastConstructProps) {
        super(scope, id);

        const region = Stack.of(this).region;
        const account = Stack.of(this).account;
        const ssmParamArn = `arn:aws:ssm:${region}:${account}:parameter/payfast_details_*`;

        const update_details = new MSC_Lambda(this, `${id}-UpdateDetails`, {
            code: "admin/payfast/update-details",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
                KMS_KEY_ID: props.kms_key.keyId,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [ssmParamArn]: [
                    "ssm:PutParameter"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Encrypt",
                    "kms:GenerateDataKey"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.axios_layer],
            timeout: 29
        });

        const reset_details = new MSC_Lambda(this, `${id}-ResetDetails`, {
            code: "admin/payfast/reset-details",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [ssmParamArn]: [
                    "ssm:DeleteParameter"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_clubby_checkout_url = new MSC_Lambda(this, `${id}-GetClubbyCheckoutUrl`, {
            code: "admin/payfast/get_clubby_checkout_url",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
                MERCHANT_ID: process.env.MERCHANT_ID as string,
                MERCHANT_KEY: process.env.MERCHANT_KEY as string,
                DOMAIN: process.env.ENVIRONMENT === "Dev" ? "http://localhost:5173" : `https://${process.env.DOMAIN}` as string,
                NOTIFY_URL: `https://${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}admin.${process.env.DOMAIN}/payfast/handleClubbyPayment`,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.axios_layer]
        });

        const handle_clubby_payment = new MSC_Lambda(this, `${id}-HandleClubbyPayment`, {
            code: "admin/payfast/handle_clubby_payment",
            envVariables: {
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                ENVIRONMENT: process.env.ENVIRONMENT || "Dev",
                CLUB_TABLE_NAME: props.club_table.tableName,
                DOMAIN: process.env.DOMAIN as string
            },
            permissions: {
                [props.billing_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.axios_layer]
        });

        const pay_fast_resource = props.api_gateway.root.addResource("payfast");

        const update_details_resource = pay_fast_resource.addResource("updateDetails");
        const reset_details_resource = pay_fast_resource.addResource("resetDetails");
        const get_clubby_checkout_url_resource = pay_fast_resource.addResource("getClubbyCheckoutUrl");
        const handle_clubby_payment_resource = pay_fast_resource.addResource("handleClubbyPayment");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(update_details_resource, update_details, methodOptions, undefined, "POST");
        addCorsEnabledMethod(reset_details_resource, reset_details, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_clubby_checkout_url_resource, get_clubby_checkout_url, methodOptions, undefined, "GET");
        addCorsEnabledMethod(handle_clubby_payment_resource, handle_clubby_payment, { methodResponses: [] }, undefined, "POST");
    }
}
