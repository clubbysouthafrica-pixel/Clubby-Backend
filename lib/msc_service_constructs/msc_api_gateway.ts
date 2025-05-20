import { RestApi, MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { MSC_Lambda } from "./msc_lambda"
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { addCorsEnabledMethod } from "../msc_custom_functions/cors_utils";

interface MCS_APIGatewayProps {
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
        });
    }
}
