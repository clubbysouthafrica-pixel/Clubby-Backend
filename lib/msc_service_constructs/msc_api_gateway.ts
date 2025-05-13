import { RestApi, MethodOptions } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { MSC_Lambda } from "./msc_lambda"
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { addCorsEnabledPostMethod } from "../msc_custom_functions/cors_utils";

interface MCS_APIGatewayProps {
}

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
        });

        // const lambda_authorizer = new MSC_Lambda(this, `${id}-Authorizer`, {
        //     code: "authorization/lambda_authorizer",
        //     envVariables: {
        //         SSM_TOKEN_NAME: props.token_parameter.parameterName,
        //     },
        //     permissions: {
        //         [props.token_parameter.parameterArn]: ["ssm:GetParameter"]
        //     }
        // })

        // const authorizer = new TokenAuthorizer(this, `${id}-TokenAuthorizer`, {
        //     handler: lambda_authorizer,
        // });

        // const methodOptions: MethodOptions = {
        //     authorizationType: AuthorizationType.CUSTOM,
        //     authorizer: authorizer,
        //     methodResponses: [{ statusCode: "200" }],
        // };
    }
}
