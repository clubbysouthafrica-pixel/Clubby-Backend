import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway } from "../../../msc_service_constructs";
import { addCorsEnabledPostMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminLoginConstructProps {
    api_gateway: MSC_APIGateway
}

export class MSC_AdminLoginConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminLoginConstructProps) {
        super(scope, id);

        const user_pool = new MSC_Cognito(this, `${id}`);

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "login/sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:SignUp",
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            }
        });

        const verify_sign_up = new MSC_Lambda(this, `${id}-VerifySignUp`, {
            code: "login/verify_sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:ConfirmSignUp"
                ]
            }
        });

        const sign_in = new MSC_Lambda(this, `${id}-SignIn`, {
            code: "login/sign_in",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            }
        });

        const refresh_token = new MSC_Lambda(this, `${id}-RefreshToken`, {
            code: "login/refresh_token",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            }
        });

        const forgot_password = new MSC_Lambda(this, `${id}-ForgotPassword`, {
            code: "login/forgot_password",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:AdminConfirmForgotPassword"
                ]
            }
        });

        const reset_password = new MSC_Lambda(this, `${id}-ResetPassword`, {
            code: "login/reset_password",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [user_pool.userPoolArn]: [
                    "cognito-idp:AdminResetUserPassword"
                ]
            }
        });

        const admin_resource = props.api_gateway.root.addResource("admin");

        const sign_up_resource = admin_resource.addResource("signUp");
        const verify_sign_up_resource = admin_resource.addResource("verifySignUp");
        const sign_in_resource = admin_resource.addResource("signIn");
        const refresh_token_resource = admin_resource.addResource("refreshToken");
        const forgot_password_resource = admin_resource.addResource("forgotPassword");
        const reset_password_resource = admin_resource.addResource("resetPassword");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledPostMethod(sign_up_resource, sign_up, methodOptions);
        addCorsEnabledPostMethod(verify_sign_up_resource, verify_sign_up, methodOptions);
        addCorsEnabledPostMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledPostMethod(refresh_token_resource, refresh_token, methodOptions);
        addCorsEnabledPostMethod(forgot_password_resource, forgot_password, methodOptions);
        addCorsEnabledPostMethod(reset_password_resource, reset_password, methodOptions);
    }
}
