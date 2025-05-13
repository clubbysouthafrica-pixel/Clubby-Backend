import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from "./msc_service_constructs";
import { MSC_JWTConstruct, MSC_LoginConstruct } from "./msc_custom_constructs";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    const main_api_gateway = new MSC_APIGateway(this, `${stack_id}-Main`);


    new MSC_LoginConstruct(this, `${stack_id}-Login`, { api_gateway: main_api_gateway });
    new MSC_JWTConstruct(this, `${stack_id}-JWT`, { api_gateway: main_api_gateway });
  }
}
