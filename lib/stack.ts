import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { 
  MSC_MemberNestedStack, 
  MSC_AdminNestedStack, 
  MSC_TablesConstruct, 
  MSC_Layers,
  MSC_BillingConstruct
} from "./msc_custom_constructs";
import { MSC_BucketsConstruct } from './msc_custom_constructs/buckets/buckets';
import { MSC_Queue } from './msc_service_constructs';

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    const billing_queue = new MSC_Queue(this, `${stack_id}-Billing`, {
      queue_name: 'Billing'
    });

    const tables = new MSC_TablesConstruct(this, stack_id, {});
    const buckets = new MSC_BucketsConstruct(this, stack_id, {});

    const layers = new MSC_Layers(this, stack_id, {});

    new MSC_BillingConstruct(this, `${stack_id}-Billing`, {
      billing_queue: billing_queue,
      layers: layers,
    });

    new MSC_MemberNestedStack(this, `${stack_id}-MemberStack`, {
      env: props?.env,
      users_table: tables.users_table,
      club_table: tables.club_table,
      club_member_table: tables.club_member_table,
      registration_form_table: tables.registration_form_table,
      image_bucket: buckets.image_bucket,
      layers,
    });

    new MSC_AdminNestedStack(this, `${stack_id}-AdminStack`, { 
      env: props?.env,
      users_table: tables.users_table, 
      club_table: tables.club_table,
      club_admin_table: tables.club_admin_table,
      registration_form_table: tables.registration_form_table,
      club_member_table: tables.club_member_table,
      image_bucket: buckets.image_bucket,
      billing_queue: billing_queue,
      layers,
    });
  }
}
