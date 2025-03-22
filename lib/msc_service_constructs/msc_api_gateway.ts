import { RestApi, LambdaIntegration, Cors } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { MSC_Lambda } from "./msc_lambda"

interface MCS_APIGatewayProps {
    get_jwt_token_lambda: MSC_Lambda;
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string, props: MCS_APIGatewayProps) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
            defaultCorsPreflightOptions: {
                allowOrigins: [
                    "*",
                ],
                allowMethods: ["PUT", "POST", "OPTIONS"],
                allowHeaders: Cors.DEFAULT_HEADERS,
                allowCredentials: true,
            },
        });

        const get_jwt_token_resource = this.root.addResource("getMSCToken")
        get_jwt_token_resource.addMethod("POST", new LambdaIntegration(props.get_jwt_token_lambda))
    }
}
