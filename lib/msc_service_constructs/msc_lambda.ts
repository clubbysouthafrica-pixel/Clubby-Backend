import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import {
    Effect,
    ManagedPolicy,
    PolicyStatement,
    Role,
    ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Duration } from "aws-cdk-lib";
import { MSC_LambdaLayer } from "./msc_lambda_layer";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

interface MSC_LambdaProps {
    code: string;
    envVariables?: Record<string, string>;
    permissions?: Record<string, Array<string>>;
    timeout?: number;
    memory?: number;
    layers?: MSC_LambdaLayer[],
    reservedConcurrentExecutions?: number;
    retention?: RetentionDays;
}

export class MSC_Lambda extends Function {
    constructor(scope: Construct, id: string, props: MSC_LambdaProps) {
        const lambdaRole = new Role(scope, `LambdaExecutionRole-${id}`, {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        });

        lambdaRole.addManagedPolicy(
            ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AWSLambdaBasicExecutionRole"
            )
        );

        if (props.permissions) {
            for (const [arn, actions] of Object.entries(props.permissions)) {
                const policyStatement = new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: actions,
                    resources: [arn],
                });
                lambdaRole.addToPolicy(policyStatement);
            }
        }

        super(scope, `${id}-Lambda`, {
            runtime: Runtime.NODEJS_20_X,
            functionName: id,
            handler: `${props.code}.handler`,
            code: Code.fromAsset(`./dist/${props.code}`),
            timeout: props.timeout ? Duration.seconds(props.timeout) : Duration.seconds(10),
            memorySize: props.memory ?? 1024,
            environment: {
                ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN as string,
                ...props.envVariables,
            },
            role: lambdaRole,
            layers: props.layers ?? undefined,
            logRetention: props.retention ?? RetentionDays.ONE_WEEK,
            reservedConcurrentExecutions: props.reservedConcurrentExecutions ?? undefined
        });
    }
}
