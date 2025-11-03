import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_LambdaLayer, MSC_Table, MSC_Cognito } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_PayFastConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    club_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_PayFastConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_PayFastConstructProps) {
        super(scope, id);

        const update_details = new MSC_Lambda(this, `${id}-UpdateDetails`, {
            code: "admin/payfast/update-details",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [`arn:aws:secretsmanager:${process.env.REGION}:${process.env.ACCOUNT}:secret:payfast_details_*`]: [
                    "secretsmanager:CreateSecret",
                    "secretsmanager:PutSecretValue",
                    "secretsmanager:DescribeSecret"
                ]
            },
            layers: [props.layers.jwt_layer]
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
                [`arn:aws:secretsmanager:${process.env.REGION}:${process.env.ACCOUNT}:secret:payfast_details_*`]: [
                    "secretsmanager:DeleteSecret"
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
