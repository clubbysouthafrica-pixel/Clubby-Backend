import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
        });
    }
}
