import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MSC_APIGateway, MSC_Cognito, MSC_Kms, MSC_Lambda, MSC_Queue, MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from "../lambda_layers";
import { AuthorizationType, MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { addCorsEnabledMethod } from "../../msc_custom_functions";
import { MSC_JWTConstruct } from "../authorization";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";

export interface MSC_PayFastNestedStackProps extends StackProps {
  club_table: MSC_Table;
  admin_user_pool: MSC_Cognito;
  kms_key: MSC_Kms;
  transactions_table: MSC_Table;
  monthly_billing_table: MSC_Table;
  users_table: MSC_Table;
}

export class MSC_PayFastNestedStack extends Stack {
  constructor(scope: Construct, id: string, props: MSC_PayFastNestedStackProps) {
    super(scope, id, props);

    const all_layers = new MSC_Layers(this, id, {});

    const api_gateway = new MSC_APIGateway(this, id, {
      domain: "payfast",
      cert_arn: process.env.PAYFAST_CERT_ARN as string
    });

    const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
      api_gateway: api_gateway,
      user_pool: props.admin_user_pool,
      user_type: "admin",
      layers: all_layers
    });

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    const payfast_resource = api_gateway.root.addResource("payfast");

    const methodOptions: MethodOptions = {
      methodResponses: [],
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: jwt_construct.token_authorizer
    }

    const save_card_details = new MSC_Lambda(this, `${id}-SaveCardDetails`, {
      code: "payfast/save_card_details",
      envVariables: {
        ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
        MERCHANT_ID: process.env.MERCHANT_ID as string,
        MERCHANT_KEY: process.env.MERCHANT_KEY as string,
        PASSPHRASE: process.env.PASSPHRASE as string,
        USERS_TABLE_NAME: props.users_table.tableName,
        RETURN_URL: `${process.env.ENVIRONMENT === "Dev" ? "http://localhost:5173" : `https://${process.env.DOMAIN}`}/billing&usage?success=true`,
        CANCEL_URL: `${process.env.ENVIRONMENT === "Dev" ? "http://localhost:5173" : `https://${process.env.DOMAIN}`}/billing&usage?success=false`,
        NOTIFY_URL: `https://${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}payfast.${process.env.DOMAIN}/payfast/saveCardSuccess`,
      },
      permissions: {
        [props.users_table.tableArn]: [
          "dynamodb:GetItem"
        ],
      },
      layers: [all_layers.jwt_layer, all_layers.axios_layer],
    });

    const save_card_details_success = new MSC_Lambda(this, `${id}-SaveCardDetailsSuccess`, {
      code: "payfast/save_card_details_success",
      envVariables: {
        ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
        CLUB_TABLE_NAME: props.club_table.tableName,
        KMS_KEY_ID: props.kms_key.keyId,
      },
      permissions: {
        [props.club_table.tableArn]: [
          "dynamodb:UpdateItem"
        ],
        [props.kms_key.keyArn]: [
          "kms:Encrypt"
        ]
      },
      layers: [all_layers.jwt_layer, all_layers.axios_layer],
    });

    const monthly_billing = new MSC_Lambda(this, `${id}-MonthlyBilling`, {
      code: "payfast/monthly_billing",
      envVariables: {
        ENVIRONMENT: process.env.ENVIRONMENT || "Prod",
        MERCHANT_ID: process.env.MERCHANT_ID as string,
        MERCHANT_KEY: process.env.MERCHANT_KEY as string,
        PASSPHRASE: process.env.PASSPHRASE as string,
        DOMAIN: process.env.DOMAIN as string,
        MONTHLY_BILLING_TABLE_NAME: props.monthly_billing_table.tableName,
        CLUB_TABLE_NAME: props.club_table.tableName,
        TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
      },
      permissions: {
        [props.monthly_billing_table.tableArn]: [
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
        ],
        [props.club_table.tableArn]: [
          "dynamodb:GetItem",
        ],
        [props.transactions_table.tableArn]: [
          "dynamodb:PutItem",
        ],
        [props.kms_key.keyArn]: [
          "kms:Decrypt",
        ],
        [`arn:aws:ses:${region}:${account}:identity/*`]: [
          "ses:SendRawEmail",
          "ses:SendEmail",
        ],
      },
      timeout: 300,
      layers: [all_layers.jwt_layer, all_layers.axios_layer],
    });

    const remove_card = new MSC_Lambda(this, `${id}-RemoveCard`, {
      code: "payfast/remove_card",
      envVariables: {
        CLUB_TABLE_NAME: props.club_table.tableName,
      },
      permissions: {
        [props.club_table.tableArn]: [
          "dynamodb:UpdateItem"
        ],
      },
      layers: [all_layers.jwt_layer],
    });

    const save_card_resource = payfast_resource.addResource("saveCard");
    const save_card_success_resource = payfast_resource.addResource("saveCardSuccess");
    const remove_card_resource = payfast_resource.addResource("removeCard");

    addCorsEnabledMethod(save_card_resource, save_card_details, methodOptions, undefined, "GET");
    addCorsEnabledMethod(save_card_success_resource, save_card_details_success, { methodResponses: [] }, undefined, "POST");
    addCorsEnabledMethod(remove_card_resource, remove_card, methodOptions, undefined, "POST");

    new Rule(this, `${id}-MonthlyBillingSchedule`, {
      schedule: Schedule.cron({ minute: "0", hour: "0", day: "1", month: "*", year: "*" }),
      targets: [new LambdaFunction(monthly_billing)],
    });

  }
}