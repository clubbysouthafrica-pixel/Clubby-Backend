import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from "./msc_service_constructs";
import { MSC_JWTConstruct } from "./msc_custom_constructs";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    const jwt_construct = new MSC_JWTConstruct(this, `${stack_id}-JWT`)

    new MSC_APIGateway(this, `${stack_id}-Main`, {
      get_jwt_token_lambda: jwt_construct.get_jwt_token,
      token_parameter: jwt_construct.token_parameter,
    });
  }
}
