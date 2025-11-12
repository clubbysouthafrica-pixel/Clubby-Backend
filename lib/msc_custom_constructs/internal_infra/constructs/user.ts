import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

interface MSC_InternalInfraUserConstructProps {
    api_gateway: MSC_APIGateway;
    admin_pool: MSC_Cognito;
    users_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    }
}

export class MSC_InternalInfraUserConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraUserConstructProps) {
        super(scope, id);

        const create_admin = new MSC_Lambda(this, `${id}-CreateAdmin`, {
            code: "internal_infra/user/create_admin",
            envVariables: {
                USER_POOL_ID: props.admin_pool.userPoolId,
                USERS_TABLE_NAME: props.users_table.tableName,
                DOMAIN: process.env.DOMAIN as string,
                USER_TYPE: "ADMIN",
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [props.admin_pool.userPoolArn]: [
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminGetUser"
                ],
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const admin_resource = props.api_gateway.root.addResource("user");

        const create_admin_resource = admin_resource.addResource("createAdmin");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }

        addCorsEnabledMethod(create_admin_resource, create_admin, methodOptions);
    }
}
