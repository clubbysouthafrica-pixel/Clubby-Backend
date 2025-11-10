import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { MSC_Table } from "../../../msc_service_constructs";

interface MSC_MemberLoginConstructProps {
    api_gateway: MSC_APIGateway;
    users_table: MSC_Table;
    user_pool: MSC_Cognito;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_MemberLoginConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberLoginConstructProps) {
        super(scope, id);

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "login/sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
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

        const verify_sign_up = new MSC_Lambda(this, `${id}-VerifySignUp`, {
            code: "login/verify_sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:ConfirmSignUp"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const activate_user = new MSC_Lambda(this, `${id}-ActivateUser`, {
            code: "login/activate_user",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:AdminRespondToAuthChallenge"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const sign_in = new MSC_Lambda(this, `${id}-SignIn`, {
            code: "login/sign_in",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const refresh_token = new MSC_Lambda(this, `${id}-RefreshToken`, {
            code: "login/refresh_token",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:InitiateAuth",
                    "cognito-idp:AdminInitiateAuth"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const forgot_password = new MSC_Lambda(this, `${id}-ForgotPassword`, {
            code: "login/forgot_password",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:AdminConfirmForgotPassword"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const reset_password = new MSC_Lambda(this, `${id}-ResetPassword`, {
            code: "login/reset_password",
            envVariables: {
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                [props.user_pool.userPoolArn]: [
                    "cognito-idp:AdminResetUserPassword"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const member_resource = props.api_gateway.root.addResource("member");

        const sign_up_resource = member_resource.addResource("signUp");
        const verify_sign_up_resource = member_resource.addResource("verifySignUp");
        const sign_in_resource = member_resource.addResource("signIn");
        const refresh_token_resource = member_resource.addResource("refreshToken");
        const forgot_password_resource = member_resource.addResource("forgotPassword");
        const reset_password_resource = member_resource.addResource("resetPassword");
        const activate_user_resource = member_resource.addResource("activateUser");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }

        addCorsEnabledMethod(sign_up_resource, sign_up, methodOptions);
        addCorsEnabledMethod(verify_sign_up_resource, verify_sign_up, methodOptions);
        addCorsEnabledMethod(sign_in_resource, sign_in, methodOptions);
        addCorsEnabledMethod(refresh_token_resource, refresh_token, methodOptions);
        addCorsEnabledMethod(forgot_password_resource, forgot_password, methodOptions);
        addCorsEnabledMethod(reset_password_resource, reset_password, methodOptions);
        addCorsEnabledMethod(activate_user_resource, activate_user, methodOptions);
    }
}
