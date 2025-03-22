import { RestApi, LambdaIntegration, Cors } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

interface MCS_APIGatewayProps {}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string, props: MCS_APIGatewayProps) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    "http://localhost:3000",
                ],
                allowMethods: ["PUT", "POST", "OPTIONS"],
                allowHeaders: Cors.DEFAULT_HEADERS,
                allowCredentials: true,
            },
        });
    }
}
