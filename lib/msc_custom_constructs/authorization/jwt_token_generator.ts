import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ParameterDataType, ParameterTier, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Cognito } from "../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../msc_custom_functions";
import { MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { Duration } from "aws-cdk-lib";

interface MSC_JWTConstructProps {
    api_gateway: MSC_APIGateway;
    user_pool: MSC_Cognito;
    user_type: "member" | "admin";
}

export class MSC_JWTConstruct extends Construct {
    public readonly token_authorizer: TokenAuthorizer;
    constructor(scope: Construct, id: string, props: MSC_JWTConstructProps) {
        super(scope, id);

        const token_parameter = new StringParameter(this, `${id}-TokenParameter`, {
            parameterName: `jwt_${props.user_type}_token`,
            stringValue: '498jjf0909340k09349k',
            description: 'This is the JWT token parameter.',
            tier: ParameterTier.STANDARD,
            dataType: ParameterDataType.TEXT,
        });

        const lambda_authorizer = new MSC_Lambda(this, `${id}-Authorizer`, {
            code: "authorization/lambda_authorizer",
            envVariables: {
                SSM_TOKEN_NAME: token_parameter.parameterName,
                USER_POOL_CLIENT_ID: props.user_pool.userPoolClient.userPoolClientId
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:GetParameter"]
            }
        });
        this.token_authorizer = new TokenAuthorizer(this, `${id}-Authorizer`, {
            handler: lambda_authorizer,
            identitySource: 'method.request.header.Authorization',
            resultsCacheTtl: Duration.seconds(60)
        });

        const token_generator = new MSC_Lambda(this, `${id}-TokenGenerator`, {
            code: "authorization/generate_jwt_token",
            envVariables: {
                JWT_SECRET: `myclubsoftware_${props.user_type}_secret`,
                USER_ID: `myclubsoftware_${props.user_type}_18*%^7838`,
                TOKEN: "ADJKJ0390290?DKFJ03#0300",
                SSM_TOKEN_NAME: token_parameter.parameterName,
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:PutParameter"]
            }
        })

        const rule = new Rule(this, `${id}-Schedule`, {
            schedule: Schedule.cron({ minute: '2', hour: '0' }),
        });
        rule.addTarget(new LambdaFunction(token_generator));

        token_generator.addPermission('EventBridgeInvoke', {
            principal: new ServicePrincipal('events.amazonaws.com'),
            sourceArn: rule.ruleArn,
        });

        const get_jwt_token = new MSC_Lambda(this, `${id}-GetToken`, {
            code: "authorization/get_jwt_token",
            envVariables: {
                JWT_SECRET: `myclubsoftware_${props.user_type}_secret`,
                LOGIN: `myclubsoftware48477@${props.user_type}.com`,
                PASSWORD: "Moving123@456",
                SSM_TOKEN_NAME: token_parameter.parameterName,
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:GetParameter"]
            }
        });

        const authorization_resource = props.api_gateway.root.addResource("authorization")
        const get_jwt_token_resource = authorization_resource.addResource("getMSCToken")
        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        addCorsEnabledMethod(get_jwt_token_resource, get_jwt_token, methodOptions);
    }
}
