import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { MSC_APIGateway, MSC_Cognito, MSC_Kms, MSC_Lambda, MSC_Queue, MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from "../lambda_layers";
import { AuthorizationType, MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { addCorsEnabledMethod } from "../../msc_custom_functions";
import { MSC_JWTConstruct } from "../authorization";

export interface MSC_SnapScanNestedStackProps extends StackProps {
  club_table: MSC_Table;
  admin_user_pool: MSC_Cognito;
  kms_key: MSC_Kms;
  snapscan_payments_table: MSC_Table;
  transactions_table: MSC_Table;
  event_registrations_table: MSC_Table;
  events_table: MSC_Table;
  monthly_billing_table: MSC_Table;
  club_member_table: MSC_Table;
  registrations_table: MSC_Table;
  mail_queue: MSC_Queue;
  users_table: MSC_Table;
  storage_table: MSC_Table;
  storage_request_table: MSC_Table;
  orders_table: MSC_Table;
  product_table: MSC_Table;
}

export class MSC_SnapScanNestedStack extends Stack {
  constructor(scope: Construct, id: string, props: MSC_SnapScanNestedStackProps) {
    super(scope, id, props);

    const all_layers = new MSC_Layers(this, id, {});

    const api_gateway = new MSC_APIGateway(this, id, {
      domain: "snapscan",
      cert_arn: process.env.SNAPSCAN_CERT_ARN as string
    });

    const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
      api_gateway: api_gateway,
      user_pool: props.admin_user_pool,
      user_type: "admin",
      layers: all_layers
    });

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    const ssmParamArn = `arn:aws:ssm:${region}:${account}:parameter/snapscan_details_*`;

    const update_details = new MSC_Lambda(this, `${id}-UpdateDetails`, {
      code: "snapscan/update-details",
      envVariables: {
        CLUB_TABLE_NAME: props.club_table.tableName,
        KMS_KEY_ID: props.kms_key.keyId,
      },
      permissions: {
        [props.club_table.tableArn]: ["dynamodb:UpdateItem"],
        [ssmParamArn]: ["ssm:PutParameter"],
        [props.kms_key.keyArn]: ["kms:Encrypt", "kms:GenerateDataKey"],
      },
      layers: [all_layers.jwt_layer],
      timeout: 29,
    });

    const fetch_qr_code = new MSC_Lambda(this, `${id}-FetchQRCode`, {
      code: "snapscan/fetch-qr-code",
      envVariables: {
        SNAPSCAN_PAYMENTS_TABLE_NAME: props.snapscan_payments_table.tableName,
        KMS_KEY_ID: props.kms_key.keyId,
        CLUB_TABLE_NAME: props.club_table.tableName,
        TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
        USERS_TABLE_NAME: props.users_table.tableName,
      },
      permissions: {
        [props.club_table.tableArn]: ["dynamodb:GetItem"],
        [props.users_table.tableArn]: ["dynamodb:GetItem"],
        [props.snapscan_payments_table.tableArn]: [
          "dynamodb:PutItem",
          "dynamodb:GetItem"
        ],
        [props.transactions_table.tableArn]: ["dynamodb:GetItem"],
        [`${props.snapscan_payments_table.tableArn}/index/TransactionIDIndex`]: ["dynamodb:Query"],
        [ssmParamArn]: ["ssm:GetParameter"],
        [props.kms_key.keyArn]: ["kms:Decrypt"],
      },
      layers: [all_layers.jwt_layer],
      timeout: 29,
    });

    const handle_payment = new MSC_Lambda(this, `${id}-HandlePayment`, {
      code: "snapscan/handle_payment",
      envVariables: {
        CLUB_TABLE_NAME: props.club_table.tableName,
        ORDERS_TABLE_NAME: props.orders_table.tableName,
        SNAPSCAN_PAYMENTS_TABLE_NAME: props.snapscan_payments_table.tableName,
        KMS_KEY_ID: props.kms_key.keyId,
        TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
        EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName,
        EVENTS_TABLE_NAME: props.events_table.tableName,
        MONTHLY_BILLING_TABLE_NAME: props.monthly_billing_table.tableName,
        CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
        REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
        SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
        STORAGE_REQUESTS_TABLE_NAME: props.storage_request_table.tableName,
        STORAGE_TABLE_NAME: props.storage_table.tableName,
        PRODUCT_TABLE_NAME: props.product_table.tableName,
        DOMAIN: process.env.DOMAIN as string,
      },
      permissions: {
        [props.orders_table.tableArn]: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        [props.product_table.tableArn]: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        [props.storage_request_table.tableArn]: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        [props.storage_table.tableArn]: ["dynamodb:UpdateItem"],
        [props.club_table.tableArn]: ["dynamodb:GetItem"],
        [props.snapscan_payments_table.tableArn]: ["dynamodb:UpdateItem", "dynamodb:GetItem"],
        [`${props.snapscan_payments_table.tableArn}/index/UserIDIndex`]: ["dynamodb:Query"],
        [ssmParamArn]: ["ssm:GetParameter"],
        [props.kms_key.keyArn]: ["kms:Decrypt"],
        [props.transactions_table.tableArn]: ["dynamodb:UpdateItem", "dynamodb:GetItem"],
        [props.event_registrations_table.tableArn]: ["dynamodb:UpdateItem"],
        [props.events_table.tableArn]: ["dynamodb:GetItem"],
        [props.monthly_billing_table.tableArn]: ["dynamodb:UpdateItem"],
        [props.club_member_table.tableArn]: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        [props.registrations_table.tableArn]: ["dynamodb:UpdateItem"],
        [props.mail_queue.queueArn]: ["sqs:SendMessage"],
        [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: ["ses:SendRawEmail"],
      },
      layers: [all_layers.jwt_layer, all_layers.qrcode_layer],
      timeout: 29,
    });

    const reset_details = new MSC_Lambda(this, `${id}-ResetDetails`, {
      code: "snapscan/reset-details",
      envVariables: {
        CLUB_TABLE_NAME: props.club_table.tableName,
      },
      permissions: {
        [props.club_table.tableArn]: ["dynamodb:UpdateItem"],
        [ssmParamArn]: ["ssm:DeleteParameter"],
      },
      layers: [all_layers.jwt_layer],
    });

    const snapscan_resource = api_gateway.root.addResource("snapscan");

    const update_details_resource = snapscan_resource.addResource("updateDetails");
    const reset_details_resource = snapscan_resource.addResource("resetDetails");
    const fetch_qr_code_resource = snapscan_resource.addResource("fetchQRCode");
    const handle_payment_resource = snapscan_resource.addResource("handlePayment");

    const methodOptions: MethodOptions = {
      methodResponses: [],
      authorizationType: AuthorizationType.CUSTOM,
      authorizer: jwt_construct.token_authorizer
    }

    addCorsEnabledMethod(update_details_resource, update_details, methodOptions, undefined, "POST");
    addCorsEnabledMethod(reset_details_resource, reset_details, methodOptions, undefined, "POST");
    addCorsEnabledMethod(fetch_qr_code_resource, fetch_qr_code, { methodResponses: [] }, undefined, "GET");
    addCorsEnabledMethod(handle_payment_resource, handle_payment, { methodResponses: [] }, undefined, "POST");
  }
}