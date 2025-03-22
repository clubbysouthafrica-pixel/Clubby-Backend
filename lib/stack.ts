import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway } from "./msc_constructs";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    new MSC_APIGateway(this, stack_id, {});
  }
}
