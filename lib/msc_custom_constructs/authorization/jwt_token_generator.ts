import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ParameterDataType, ParameterTier, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway } from "../../msc_service_constructs";
import { addCorsEnabledPostMethod } from "../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { type } from "os";

interface MSC_JWTConstructProps { 
    api_gateway: MSC_APIGateway;
    user_type: "member" | "admin";
 }

export class MSC_JWTConstruct extends Construct {
    // public readonly token_parameter: StringParameter;
    constructor(scope: Construct, id: string, props: MSC_JWTConstructProps) {
        super(scope, id);

        const token_parameter = new StringParameter(this, `${id}-TokenParameter`, {
            parameterName: 'jwt-token',
            stringValue: '498jjf0909340k09349k',
            description: 'This is the JWT token parameter.',
            tier: ParameterTier.STANDARD,
            dataType: ParameterDataType.TEXT,
        });
        // this.token_parameter = token_parameter;

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

        // ------ Creating the Get Auth token endpoint ------
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
        addCorsEnabledPostMethod(get_jwt_token_resource, get_jwt_token, methodOptions);
    }
}
