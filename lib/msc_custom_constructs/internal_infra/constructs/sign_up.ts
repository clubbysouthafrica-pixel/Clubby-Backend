import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_InternalInfraAdminSignupConstructProps {
    api_gateway: MSC_APIGateway;
    admin_pool: MSC_Cognito;
    users_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_InternalInfraAdminSignupConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraAdminSignupConstructProps) {
        super(scope, id);

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "login/sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: props.admin_pool.userPoolClient.userPoolClientId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "ADMIN",
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [props.admin_pool.userPoolArn]: [
                    "cognito-idp:SignUp",
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const admin_resource = props.api_gateway.root.addResource("admin");

        const sign_up_resource = admin_resource.addResource("signUp");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledMethod(sign_up_resource, sign_up, methodOptions);
    }
}
