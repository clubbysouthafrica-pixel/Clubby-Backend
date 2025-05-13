import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway } from "../msc_service_constructs";
import { addCorsEnabledPostMethod } from "../msc_custom_functions/cors_utils";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

interface MSC_LoginConstructProps {
    api_gateway: MSC_APIGateway
}

export class MSC_LoginConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_LoginConstructProps) {
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

        const sign_up_resource = props.api_gateway.root.addResource("signUp");
        const verify_sign_up_resource = props.api_gateway.root.addResource("verifySignUp");
        const sign_in_resource = props.api_gateway.root.addResource("signIn");
        const refresh_token_resource = props.api_gateway.root.addResource("refreshToken");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledPostMethod(sign_up_resource, sign_up, methodOptions);
        addCorsEnabledPostMethod(verify_sign_up_resource, verify_sign_up, methodOptions);
        addCorsEnabledPostMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledPostMethod(refresh_token_resource, refresh_token, methodOptions);
    }
}
