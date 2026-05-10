import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  MSC_MemberNestedStack,
  MSC_AdminNestedStack,
  MSC_TablesConstruct,
  MSC_Layers,
  MSC_InternalInfraStack,
  MSC_MailingStack,
  MSC_AdminFeaturesNestedStack,
  MSC_SnapScanNestedStack,
} from "./msc_custom_constructs";
import { MSC_BucketsConstruct } from "./msc_custom_constructs/buckets/buckets";
import { MSC_Cognito, MSC_Queue, MSC_Kms } from "./msc_service_constructs";
import { MSC_InfraStack } from "./mcs_infrastructure";

export class MSC_Stack extends cdk.Stack {
  constructor(scope: Construct, stack_id: string, props?: cdk.StackProps) {
    super(scope, stack_id, props);

    if (process.env.ENVIRONMENT !== "Dev") {
      this.terminationProtection = true;
    }

    const kmsKey = new MSC_Kms(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}DataEncryption`, {
      enableKeyRotation: true,
      description: "KMS key for encrypting MyClubSoftware data",
    });

    const mail_queue = new MSC_Queue(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}SendMail`, {
      queue_name: `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}SendMail`,
    });
    const club_deregistration_queue = new MSC_Queue(
      this,
      `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}ClubDeregistration`,
      {
        queue_name: `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}ClubDeregistration`,
        timeout: 900,
      },
    );

    const member_user_pool = new MSC_Cognito(this, `${stack_id}-Member`);
    const admin_user_pool = new MSC_Cognito(this, `${stack_id}-Admin`);

    const tables = new MSC_TablesConstruct(this, stack_id, {});
    const buckets = new MSC_BucketsConstruct(this, stack_id, {});

    new MSC_MailingStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}MailerStack`, {
      env: props?.env,
      mail_queue: mail_queue,
      billing_table: tables.billing_table,
    });

    new MSC_AdminFeaturesNestedStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}AdminFeaturesStack`, {
      env: props?.env,
      admin_user_pool: admin_user_pool,
      venues_bookings_table: tables.venues_bookings_table,
      venues_table: tables.venues_table,
      club_table: tables.club_table,
      product_table: tables.products_table,
      shop_images_bucket: buckets.shop_images_bucket,
      orders_table: tables.orders_table,
      transactions_table: tables.transactions_table,
      billing_table: tables.billing_table,
      storage_table: tables.storage_table,
      storage_requests_table: tables.storage_request_table,
      events_table: tables.events_table,
      event_registrations_table: tables.event_registrations_table,
    });

    new MSC_AdminNestedStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}AdminStack`, {
      env: props?.env,
      event_registrations_table: tables.event_registrations_table,
      events_table: tables.events_table,
      storage_requests_table: tables.storage_request_table,
      signatures_bucket: buckets.signatures_bucket,
      shop_images_bucket: buckets.shop_images_bucket,
      member_user_pool: member_user_pool,
      admin_user_pool: admin_user_pool,
      orders_table: tables.orders_table,
      club_deregistration_queue: club_deregistration_queue,
      transactions_table: tables.transactions_table,
      users_table: tables.users_table,
      billing_table: tables.billing_table,
      product_table: tables.products_table,
      club_table: tables.club_table,
      club_admin_table: tables.club_admin_table,
      registration_form_table: tables.registration_form_table,
      registrations_table: tables.registrations_table,
      club_member_table: tables.club_member_table,
      image_bucket: buckets.image_bucket,
      club_history_bucket: buckets.club_history_bucket,
      email_rate_limiter_table: tables.email_rate_limiter_table,
      mail_queue: mail_queue,
      kms_key: kmsKey,
    });

    new MSC_InternalInfraStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}InternalInfra`, {
      env: props?.env,
      admin_pool: admin_user_pool,
      club_admin_table: tables.club_admin_table,
      users_table: tables.users_table,
      club_table: tables.club_table,
    });

    new MSC_SnapScanNestedStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}SnapscanStack`, {
      env: props?.env,
      club_table: tables.club_table,
      kms_key: kmsKey,
      admin_user_pool: admin_user_pool,
      snapscan_payments_table: tables.snapscan_payments_table,
      transactions_table: tables.transactions_table,
      event_registrations_table: tables.event_registrations_table,
      events_table: tables.events_table,
      monthly_billing_table: tables.billing_table,
      club_member_table: tables.club_member_table,
      registrations_table: tables.registrations_table,
      mail_queue: mail_queue,
      users_table: tables.users_table,
    });

    new MSC_MemberNestedStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}MemberStack`, {
      env: props?.env,
      events_table: tables.events_table,
      venues_table: tables.venues_table,
      venues_bookings_table: tables.venues_bookings_table,
      email_rate_limiter_table: tables.email_rate_limiter_table,
      product_table: tables.products_table,
      orders_table: tables.orders_table,
      signatures_bucket: buckets.signatures_bucket,
      member_user_pool: member_user_pool,
      registrations_table: tables.registrations_table,
      transactions_table: tables.transactions_table,
      billing_table: tables.billing_table,
      users_table: tables.users_table,
      club_table: tables.club_table,
      club_member_table: tables.club_member_table,
      storage_table: tables.storage_table,
      storage_requests_table: tables.storage_request_table,
      registration_form_table: tables.registration_form_table,
      event_registrations_table: tables.event_registrations_table,
      image_bucket: buckets.image_bucket,
      mail_queue: mail_queue,
      shop_images_bucket: buckets.shop_images_bucket,
      kms_key: kmsKey,
    });

    new MSC_InfraStack(this, `${process.env.ENVIRONMENT === "Dev" ? `${process.env.DEPLOYER}-` : ""}InfraStack`, {
      env: props?.env,
      assets_bucket_name: buckets.image_bucket.bucketName,
    });
  }
}
