import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { MSC_Table } from "../../../msc_service_constructs";

interface MSC_MemberLoginConstructProps {
    api_gateway: MSC_APIGateway;
    users_table: MSC_Table;
}

export class MSC_MemberLoginConstruct extends Construct {
    public readonly user_pool: MSC_Cognito;
    constructor(scope: Construct, id: string, props: MSC_MemberLoginConstructProps) {
        super(scope, id);

        this.user_pool = new MSC_Cognito(this, id);

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "login/sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
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

        const verify_sign_up = new MSC_Lambda(this, `${id}-VerifySignUp`, {
            code: "login/verify_sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: this.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [this.user_pool.userPoolArn]: [
                    "cognito-idp:ConfirmSignUp"
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
            }
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

        const member_resource = props.api_gateway.root.addResource("member");

        const sign_up_resource = member_resource.addResource("signUp");
        const verify_sign_up_resource = member_resource.addResource("verifySignUp");
        const sign_in_resource = member_resource.addResource("signIn");
        const refresh_token_resource = member_resource.addResource("refreshToken");
        const forgot_password_resource = member_resource.addResource("forgotPassword");
        const reset_password_resource = member_resource.addResource("resetPassword");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        
        addCorsEnabledMethod(sign_up_resource, sign_up, methodOptions);
        addCorsEnabledMethod(verify_sign_up_resource, verify_sign_up, methodOptions);
        addCorsEnabledMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledMethod(refresh_token_resource, refresh_token, methodOptions);
        addCorsEnabledMethod(forgot_password_resource, forgot_password, methodOptions);
        addCorsEnabledMethod(reset_password_resource, reset_password, methodOptions);
    }
}
