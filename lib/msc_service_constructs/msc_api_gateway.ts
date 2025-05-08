import { RestApi, LambdaIntegration, Cors, MethodOptions, TokenAuthorizer, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { MSC_Lambda } from "./msc_lambda"
import { StringParameter } from "aws-cdk-lib/aws-ssm";

interface MCS_APIGatewayProps {
    sign_up_lambda: MSC_Lambda;
    verify_sign_up_lambda: MSC_Lambda;
    sign_in_lambda: MSC_Lambda;
    refresh_token_lambda: MSC_Lambda;
    get_jwt_token_lambda: MSC_Lambda;
    token_parameter: StringParameter;
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string, props: MCS_APIGatewayProps) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    "https://localhost:3000",
                ],
                allowMethods: Cors.ALL_METHODS,
                allowHeaders: Cors.DEFAULT_HEADERS,
                allowCredentials: true,
            },
        });

        const lambda_authorizer = new MSC_Lambda(this, `${id}-Authorizer`, {
            code: "authorization/lambda_authorizer",
            envVariables: {
                SSM_TOKEN_NAME: props.token_parameter.parameterName,
            },
            permissions: {
                [props.token_parameter.parameterArn]: ["ssm:GetParameter"]
            }
        })

        const authorizer = new TokenAuthorizer(this, `${id}-TokenAuthorizer`, {
            handler: lambda_authorizer,
        });

        const methodOptions: MethodOptions = {
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: authorizer, 
            methodResponses: [{ statusCode: "200" }],
        };

        const get_jwt_token_resource = this.root.addResource("getMSCToken")
        get_jwt_token_resource.addMethod("POST", new LambdaIntegration(props.get_jwt_token_lambda), {
            methodResponses: [{ statusCode: "200" }],
        })

        const sign_up_resource = this.root.addResource("signUp");
        sign_up_resource.addMethod("POST", new LambdaIntegration(props.sign_up_lambda), methodOptions)

        const refresh_token_resource = this.root.addResource("refreshToken");
        refresh_token_resource.addMethod("POST", new LambdaIntegration(props.refresh_token_lambda), methodOptions)

        const verify_sign_up_resource = this.root.addResource("verifySignUp");
        verify_sign_up_resource.addMethod("POST", new LambdaIntegration(props.verify_sign_up_lambda), methodOptions)

        const sign_in_resource = this.root.addResource("signIn");
        sign_in_resource.addMethod("POST", new LambdaIntegration(props.sign_in_lambda), methodOptions)
    }
}
