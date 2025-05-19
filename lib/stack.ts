import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_MemberNestedStack, MSC_AdminNestedStack } from "./msc_custom_constructs";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    new MSC_MemberNestedStack(this, `${stack_id}-MemberStack`);
    new MSC_AdminNestedStack(this, `${stack_id}-AdminStack`);
  }
}
