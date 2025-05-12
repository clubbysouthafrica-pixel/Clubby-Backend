import { RestApi, LambdaIntegration, MethodOptions, TokenAuthorizer, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { MSC_Lambda } from "./msc_lambda"
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { MockIntegration, PassthroughBehavior } from "aws-cdk-lib/aws-apigateway";

interface MCS_APIGatewayProps {
    sign_up_lambda: MSC_Lambda;
    verify_sign_up_lambda: MSC_Lambda;
    sign_in_lambda: MSC_Lambda;
    refresh_token_lambda: MSC_Lambda;
    get_jwt_token_lambda: MSC_Lambda;
    token_parameter: StringParameter;
}

function addCorsEnabledPostMethod(
    resource: any,
    lambda: MSC_Lambda,
    methodOptions: MethodOptions,
    origin = 'http://localhost:5173'
) {
    const integration = new LambdaIntegration(lambda, {
        integrationResponses: ['200', '400', '500'].map((statusCode) => ({
            statusCode,
            responseParameters: {
                'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
                'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                'method.response.header.Access-Control-Allow-Credentials': "'true'",
            },
        })),
    });

    const methodResponses = ['200', '400', '500'].map((statusCode) => ({
        statusCode,
        responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
        },
    }));

    resource.addMethod('POST', integration, {
        ...methodOptions,
        methodResponses,
    });

    addCorsOptions(resource, origin);
}

function addCorsOptions(resource: any, origin = 'http://localhost:5173') {
    resource.addMethod(
        'OPTIONS',
        new MockIntegration({
            integrationResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers':
                            "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                        'method.response.header.Access-Control-Allow-Origin': `'${origin}'`,
                        'method.response.header.Access-Control-Allow-Credentials': "'true'",
                        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                    },
                },
            ],
            passthroughBehavior: PassthroughBehavior.NEVER,
            requestTemplates: {
                'application/json': '{"statusCode": 200}',
            },
        }),
        {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Headers': true,
                        'method.response.header.Access-Control-Allow-Origin': true,
                        'method.response.header.Access-Control-Allow-Credentials': true,
                        'method.response.header.Access-Control-Allow-Methods': true,
                    },
                },
            ],
        }
    );
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string, props: MCS_APIGatewayProps) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
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
        // get_jwt_token_resource.addMethod("POST", new LambdaIntegration(props.get_jwt_token_lambda), {
        //     methodResponses: [{ statusCode: "200" }],
        // })

        const sign_up_resource = this.root.addResource("signUp");
        // sign_up_resource.addMethod("POST", new LambdaIntegration(props.sign_up_lambda), methodOptions)

        const refresh_token_resource = this.root.addResource("refreshToken");
        // refresh_token_resource.addMethod("POST", new LambdaIntegration(props.refresh_token_lambda), methodOptions)

        const verify_sign_up_resource = this.root.addResource("verifySignUp");
        // verify_sign_up_resource.addMethod("POST", new LambdaIntegration(props.verify_sign_up_lambda), methodOptions)

        const sign_in_resource = this.root.addResource("signIn");
        // sign_in_resource.addMethod("POST", new LambdaIntegration(props.sign_in_lambda), methodOptions)

        addCorsEnabledPostMethod(sign_up_resource, props.sign_up_lambda, methodOptions);
        addCorsEnabledPostMethod(verify_sign_up_resource, props.verify_sign_up_lambda, methodOptions);
        addCorsEnabledPostMethod(sign_in_resource, props.sign_in_lambda, methodOptions);
        addCorsEnabledPostMethod(refresh_token_resource, props.refresh_token_lambda, methodOptions);
        addCorsEnabledPostMethod(get_jwt_token_resource, props.get_jwt_token_lambda, {
            methodResponses: [],
        });
    }
}
