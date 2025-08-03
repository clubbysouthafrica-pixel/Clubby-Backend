import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  MSC_MemberNestedStack, 
  MSC_AdminNestedStack, 
  MSC_TablesConstruct, 
  MSC_Layers,
  MSC_InternalInfraStack,
  MSC_MailingStack
} from "./msc_custom_constructs";
import { MSC_BucketsConstruct } from './msc_custom_constructs/buckets/buckets';
import { MSC_Queue } from './msc_service_constructs';

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    const mail_queue = new MSC_Queue(this, `SendMail`, {
      queue_name: 'SendMail',
    });

    const tables = new MSC_TablesConstruct(this, stack_id, {});
    const buckets = new MSC_BucketsConstruct(this, stack_id, {});

    const layers = new MSC_Layers(this, stack_id, {});

    new MSC_MailingStack(this, `MailerStack`, {
      env: props?.env,
      mail_queue: mail_queue
    });

    const admin_stack = new MSC_AdminNestedStack(this, `AdminStack`, { 
      env: props?.env,
      users_table: tables.users_table, 
      billing_table: tables.billing_table,
      club_table: tables.club_table,
      club_admin_table: tables.club_admin_table,
      registration_form_table: tables.registration_form_table,
      club_member_table: tables.club_member_table,
      image_bucket: buckets.image_bucket,
      club_history_bucket: buckets.club_history_bucket,
      mail_queue: mail_queue,
      layers
    });

    new MSC_InternalInfraStack(this, `InternalInfra`, {
      env: props?.env,
      admin_pool: admin_stack.admin_pool,
      layers: layers,
      club_admin_table: tables.club_admin_table,
      users_table: tables.users_table,
      club_table: tables.club_table
    });

    new MSC_MemberNestedStack(this, `MemberStack`, {
      env: props?.env,
      users_table: tables.users_table,
      club_table: tables.club_table,
      club_member_table: tables.club_member_table,
      registration_form_table: tables.registration_form_table,
      image_bucket: buckets.image_bucket,
      layers,
    });
  }
}
