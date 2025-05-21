import { ResponseType, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

export class MSC_APIGateway extends RestApi {
    constructor(scope: Construct, id: string) {
        super(scope, `${id}-APIGateway`, {
            restApiName: `${id}-APIGateway`,
        });

        this.addGatewayResponse('UnauthorizedResponse', {
            type: ResponseType.UNAUTHORIZED,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'http://localhost:5173'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });

        this.addGatewayResponse('AccessDeniedResponse', {
            type: ResponseType.ACCESS_DENIED,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'http://localhost:5173'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'OPTIONS,POST,GET'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
    }
}
