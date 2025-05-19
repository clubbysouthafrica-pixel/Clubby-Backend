import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ParameterDataType, ParameterTier, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway } from "../../../msc_service_constructs";
import { addCorsEnabledPostMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

interface MSC_JWTConstructProps { 
    api_gateway: MSC_APIGateway
 }

export class MSC_JWTConstruct extends Construct {
    // public readonly token_parameter: StringParameter;
    constructor(scope: Construct, id: string, props: MSC_JWTConstructProps) {
        super(scope, id);

        const token_parameter = new StringParameter(this, `${id}-Token-Parameter`, {
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
                JWT_SECRET: "myclubsoftware_secret",
                USER_ID: "myclubsoftware_342129",
                TOKEN: "mf508mf959mfn44",
                SSM_TOKEN_NAME: token_parameter.parameterName,
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:PutParameter"]
            }
        })

        const rule = new Rule(this, `${id}-Schedule`, {
            schedule: Schedule.cron({ minute: '0', hour: '0' }),
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
                JWT_SECRET: "myclubsoftware_secret",
                USER_ID: "myclubsoftware_342129",
                TOKEN: "mf508mf959mfn44",
                SSM_TOKEN_NAME: token_parameter.parameterName,
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:GetParameter"]
            }
        });
        const get_jwt_token_resource = props.api_gateway.root.addResource("getMSCToken")
        const methodOptions: MethodOptions = {
            methodResponses: [],
        }
        addCorsEnabledPostMethod(get_jwt_token_resource, get_jwt_token, methodOptions);
    }
}
