import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_LambdaLayer, MSC_Table, MSC_Kms } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { Stack } from "aws-cdk-lib";

interface MSC_PayFastConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    club_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        axios_layer: MSC_LambdaLayer;
    };
    kms_key: MSC_Kms;
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
                KMS_KEY_ID: props.kms_key.keyId
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
            layers: [props.layers.jwt_layer, props.layers.axios_layer]
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

        const pay_fast_resource = props.api_gateway.root.addResource("payfast");

        const update_details_resource = pay_fast_resource.addResource("updateDetails");
        const reset_details_resource = pay_fast_resource.addResource("resetDetails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(update_details_resource, update_details, methodOptions, undefined, "POST");
        addCorsEnabledMethod(reset_details_resource, reset_details, methodOptions, undefined, "POST");
    }
}
