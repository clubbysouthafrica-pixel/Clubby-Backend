import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ParameterDataType, ParameterTier, ParameterType, StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { MSC_Lambda } from "../msc_service_constructs";

interface MSC_JWTConstructProps {  }

export class MSC_JWTConstruct extends Construct {
    public readonly get_jwt_token: MSC_Lambda;
    public readonly token_parameter: StringParameter;
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const token_parameter = new StringParameter(this, `${id}-Token-Parameter`, {
            parameterName: 'jwt-token',
            stringValue: '498jjf0909340k09349k',
            description: 'This is the JWT token parameter.',
            tier: ParameterTier.STANDARD,
            dataType: ParameterDataType.TEXT,
        });
        this.token_parameter = token_parameter;

        const token_generator = new MSC_Lambda(this, `${id}-TokenGenerator`, {
            code: "generate_jwt_token",
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

        this.get_jwt_token = new MSC_Lambda(this, `${id}-GetToken`, {
            code: "get_jwt_token",
            envVariables: {
                JWT_SECRET: "myclubsoftware_secret",
                USER_ID: "myclubsoftware_342129",
                TOKEN: "mf508mf959mfn44",
                SSM_TOKEN_NAME: token_parameter.parameterName,
            },
            permissions: {
                [token_parameter.parameterArn]: ["ssm:GetParameter"]
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
    }
}
