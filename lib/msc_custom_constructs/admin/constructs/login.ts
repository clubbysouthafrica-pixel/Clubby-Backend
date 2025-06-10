import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_AdminLoginConstructProps {
    api_gateway: MSC_APIGateway;
    users_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_AdminLoginConstruct extends Construct {
    public readonly user_pool: MSC_Cognito;
    constructor(scope: Construct, id: string, props: MSC_AdminLoginConstructProps) {
        super(scope, id);

        this.user_pool = new MSC_Cognito(this, `${id}`, {
            auto_verify: false,
        });

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "login/sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "ADMIN",
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:SignUp",
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            }
        });

        const sign_in = new MSC_Lambda(this, `${id}-SignIn`, {
            code: "login/sign_in",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const refresh_token = new MSC_Lambda(this, `${id}-RefreshToken`, {
            code: "login/refresh_token",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            }
        });

        const forgot_password = new MSC_Lambda(this, `${id}-ForgotPassword`, {
            code: "login/forgot_password",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:AdminConfirmForgotPassword"
                ]
            }
        });

        const reset_password = new MSC_Lambda(this, `${id}-ResetPassword`, {
            code: "login/reset_password",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:AdminResetUserPassword"
                ]
            }
        });

        const admin_resource = props.api_gateway.root.addResource("admin");

        const sign_up_resource = admin_resource.addResource("signUp");
        const sign_in_resource = admin_resource.addResource("signIn");
        const refresh_token_resource = admin_resource.addResource("refreshToken");
        const forgot_password_resource = admin_resource.addResource("forgotPassword");
        const reset_password_resource = admin_resource.addResource("resetPassword");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledMethod(sign_up_resource, sign_up, methodOptions);
        addCorsEnabledMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledMethod(refresh_token_resource, refresh_token, methodOptions);
        addCorsEnabledMethod(forgot_password_resource, forgot_password, methodOptions);
        addCorsEnabledMethod(reset_password_resource, reset_password, methodOptions);
    }
}
