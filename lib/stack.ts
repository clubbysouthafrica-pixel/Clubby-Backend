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
import { MSC_Cognito, MSC_Queue } from './msc_service_constructs';

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);
    this.terminationProtection = true;

    const mail_queue = new MSC_Queue(this, `SendMail`, {
      queue_name: 'SendMail',
    });
    const club_deregistration_queue = new MSC_Queue(this, `ClubDeregistration`, {
      queue_name: 'ClubDeregistration',
      timeout: 900
    });

    const member_user_pool = new MSC_Cognito(this, `${stack_id}-Member`);
    const admin_user_pool = new MSC_Cognito(this, `${stack_id}-Admin`);

    const tables = new MSC_TablesConstruct(this, stack_id, {});
    const buckets = new MSC_BucketsConstruct(this, stack_id, {});

    const all_layers = new MSC_Layers(this, stack_id, {});

    new MSC_MailingStack(this, `MailerStack`, {
      env: props?.env,
      mail_queue: mail_queue,
      billing_table: tables.billing_table,
      layers: {
        jwt_layer: all_layers.jwt_layer
      },
    });

    new MSC_AdminNestedStack(this, `AdminStack`, {
      env: props?.env,
      signatures_bucket: buckets.signatures_bucket,
      member_user_pool: member_user_pool,
      admin_user_pool: admin_user_pool,
      club_deregistration_queue: club_deregistration_queue,
      transactions_table: tables.transactions_table,
      users_table: tables.users_table,
      billing_table: tables.billing_table,
      club_table: tables.club_table,
      club_admin_table: tables.club_admin_table,
      registration_form_table: tables.registration_form_table,
      registrations_table: tables.registrations_table,
      club_member_table: tables.club_member_table,
      image_bucket: buckets.image_bucket,
      club_history_bucket: buckets.club_history_bucket,
      mail_queue: mail_queue,
      layers: {
        jwt_layer: all_layers.jwt_layer,
        jwks_rsa_layer: all_layers.jwks_rsa_layer,
        axios_layer: all_layers.axios_layer
      }
    });

    new MSC_InternalInfraStack(this, `InternalInfra`, {
      env: props?.env,
      admin_pool: admin_user_pool,
      layers: {
        jwt_layer: all_layers.jwt_layer,
      },
      club_admin_table: tables.club_admin_table,
      users_table: tables.users_table,
      club_table: tables.club_table
    });

    new MSC_MemberNestedStack(this, `MemberStack`, {
      env: props?.env,
      signatures_bucket: buckets.signatures_bucket,
      member_user_pool: member_user_pool,
      registrations_table: tables.registrations_table,
      transactions_table: tables.transactions_table,
      billing_table: tables.billing_table,
      users_table: tables.users_table,
      club_table: tables.club_table,
      club_member_table: tables.club_member_table,
      registration_form_table: tables.registration_form_table,
      image_bucket: buckets.image_bucket,
      mail_queue: mail_queue,
      layers: {
        jwt_layer: all_layers.jwt_layer,
        jwks_rsa_layer: all_layers.jwks_rsa_layer,
        axios_layer: all_layers.axios_layer
      }
    });
  }
}
