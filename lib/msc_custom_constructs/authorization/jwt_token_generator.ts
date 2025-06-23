import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Cognito } from "../../msc_service_constructs";
import { TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { Duration } from "aws-cdk-lib";
import { MSC_Layers } from "../lambda_layers";

interface MSC_JWTConstructProps {
    api_gateway: MSC_APIGateway;
    user_pool: MSC_Cognito;
    user_type: "member" | "admin";
    layers: MSC_Layers;
}

export class MSC_JWTConstruct extends Construct {
    public readonly token_authorizer: TokenAuthorizer;
    constructor(scope: Construct, id: string, props: MSC_JWTConstructProps) {
        super(scope, id);

        const lambda_authorizer = new MSC_Lambda(this, `${id}-Authorizer`, {
            code: "authorization/lambda_authorizer",
            envVariables: {
                USER_POOL_ID: props.user_pool.userPoolId,
                ENVIRONMENT: process.env.ENVIRONMENT as string,
            },
            layers: [props.layers.jwt_layer, props.layers.jwks_rsa_layer]
        });


        this.token_authorizer = new TokenAuthorizer(this, `${id}-Authorizer`, {
            handler: lambda_authorizer,
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: Duration.seconds(60)
        });
    }
}
