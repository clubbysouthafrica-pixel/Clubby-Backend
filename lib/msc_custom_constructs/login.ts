import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda } from "../msc_service_constructs";

interface MSC_LoginConstructProps {  }

export class MSC_LoginConstruct extends Construct {
    public readonly get_jwt_token: MSC_Lambda;
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const user_pool = new MSC_Cognito(this, `${id}`);

        const sign_up = new MSC_Lambda(this, `${id}-SignUp`, {
            code: "sign_up",
            envVariables: {
                USER_POOL_CLIENT_ID: user_pool.userPoolClient.userPoolClientId,
            },
            permissions: {
                ["*"]: [
                    "cognito-idp:SignUp", 
                    "cognito-idp:InitiateAuth", 
                    "cognito-idp:AdminInitiateAuth"
                ]
            }
        });
    }
}
