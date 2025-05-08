import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda } from "../msc_service_constructs";

interface MSC_LoginConstructProps {  }

export class MSC_LoginConstruct extends Construct {
    public readonly sign_up: MSC_Lambda;
    public readonly sign_in: MSC_Lambda;
    public readonly verify_sign_up: MSC_Lambda;
    public readonly refresh_token: MSC_Lambda;
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const user_pool = new MSC_Cognito(this, `${id}`);

        this.sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
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

        this.verify_sign_up = new MSC_Lambda(this, `${id}-VerifySignUp`, {
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

        this.sign_in = new MSC_Lambda(this, `${id}-SignIn`, {
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

        this.refresh_token = new MSC_Lambda(this, `${id}-RefreshToken`, {
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
    }
}
