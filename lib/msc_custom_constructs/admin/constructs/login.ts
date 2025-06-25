import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_AdminLoginConstructProps {
    api_gateway: MSC_APIGateway;
    layers: MSC_Layers;
}

export class MSC_AdminLoginConstruct extends Construct {
    public readonly user_pool: MSC_Cognito;
    constructor(scope: Construct, id: string, props: MSC_AdminLoginConstructProps) {
        super(scope, id);

        this.user_pool = new MSC_Cognito(this, `${id}`, {
            auto_verify: false,
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
            },
            layers: [props.layers.jwt_layer]
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
            },
            layers: [props.layers.jwt_layer]
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
            },
            layers: [props.layers.jwt_layer]
        });

        const admin_resource = props.api_gateway.root.addResource("admin");

        const sign_in_resource = admin_resource.addResource("signIn");
        const refresh_token_resource = admin_resource.addResource("refreshToken");
        const forgot_password_resource = admin_resource.addResource("forgotPassword");
        const reset_password_resource = admin_resource.addResource("resetPassword");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledMethod(refresh_token_resource, refresh_token, methodOptions);
        addCorsEnabledMethod(forgot_password_resource, forgot_password, methodOptions);
        addCorsEnabledMethod(reset_password_resource, reset_password, methodOptions);
    }
}
