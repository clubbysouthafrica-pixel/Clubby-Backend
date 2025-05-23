import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_MemberNestedStack, MSC_AdminNestedStack, MSC_TablesConstruct } from "./msc_custom_constructs";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    const tables = new MSC_TablesConstruct(this, stack_id, {})

    new MSC_MemberNestedStack(this, `${stack_id}-MemberStack`, {
      users_table: tables.users_table,
      club_member_table: tables.club_member_table,
      club_account_table: tables.club_account_table,
    });

    new MSC_AdminNestedStack(this, `${stack_id}-AdminStack`, { 
      users_table: tables.users_table, 
      club_account_table: tables.club_account_table 
    });
  }
}
