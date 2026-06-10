import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  MSC_APIGateway,
  MSC_Bucket,
  MSC_Cognito,
  MSC_Kms,
  MSC_Queue,
} from "../../msc_service_constructs";
import { MSC_JWTConstruct } from "../authorization";
import {
  MSC_MemberLoginConstruct,
  MSC_MemberUserConstruct,
  MSC_MemberClubConstruct,
  MSC_MemberRegistrationFormConstruct,
  MSC_ClubMemberConstruct,
  MSC_ImagesConstruct,
  MSC_TransactionsConstruct,
  MSC_PayfastConstruct,
  MSC_MemberShopConstruct,
  MSC_MemberOrdersConstruct,
  MSC_BookingsConstruct,
  MSC_VenuesConstruct,
  MSC_EventsConstruct,
  MSC_StorageRequestConstruct,
  MSC_StorageConstruct,
} from "./constructs";
import { MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from "../lambda_layers";

export interface MSC_MemberNestedStackProps extends StackProps {
  users_table: MSC_Table;
  club_table: MSC_Table;
  member_user_pool: MSC_Cognito;
  club_member_table: MSC_Table;
  registration_form_table: MSC_Table;
  registrations_table: MSC_Table;
  transactions_table: MSC_Table;
  image_bucket: MSC_Bucket;
  signatures_bucket: MSC_Bucket;
  venues_bookings_table: MSC_Table;
  mail_queue: MSC_Queue;
  shop_images_bucket: MSC_Bucket;
  venues_table: MSC_Table;
  billing_table: MSC_Table;
  orders_table: MSC_Table;
  event_registrations_table: MSC_Table;
  events_table: MSC_Table;
  product_table: MSC_Table;
  email_rate_limiter_table: MSC_Table;
  kms_key: MSC_Kms;
  storage_table: MSC_Table;
  storage_requests_table: MSC_Table;
}

export class MSC_MemberNestedStack extends Stack {
  constructor(scope: Construct, id: string, props: MSC_MemberNestedStackProps) {
    super(scope, id, props);

    const all_layers = new MSC_Layers(this, id, {});

    const api_gateway = new MSC_APIGateway(this, id, {
      domain: "member",
      cert_arn: process.env.MEMBER_CERT_ARN as string,
    });

    new MSC_MemberLoginConstruct(this, `${id}-Login`, {
      api_gateway: api_gateway,
      users_table: props.users_table,
      user_pool: props.member_user_pool,
      layers: all_layers,
      email_rate_limiter_table: props.email_rate_limiter_table,
    });

    const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
      api_gateway: api_gateway,
      user_type: "member",
      user_pool: props.member_user_pool,
      layers: all_layers,
    });

    new MSC_BookingsConstruct(this, `${id}-Bookings`, {
      api_gateway: api_gateway,
      layers: all_layers,
      token_authorizer: jwt_construct.token_authorizer,
      venues_bookings_table: props.venues_bookings_table,
    });

    new MSC_VenuesConstruct(this, `${id}-Venues`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      venues_table: props.venues_table,
      club_table: props.club_table,
      layers: all_layers,
    });

    new MSC_MemberOrdersConstruct(this, `${id}-Orders`, {
      api_gateway: api_gateway,
      orders_table: props.orders_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      product_table: props.product_table,
      users_table: props.users_table,
      club_table: props.club_table,
      club_member_table: props.club_member_table,
      member_user_pool: props.member_user_pool,
      transactions_table: props.transactions_table,
    });

    new MSC_MemberShopConstruct(this, `${id}-Shop`, {
      api_gateway: api_gateway,
      product_table: props.product_table,
      club_table: props.club_table,
      club_member_table: props.club_member_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
    });

    new MSC_PayfastConstruct(this, `${id}-Payfast`, {
      api_gateway: api_gateway,
      mail_queue: props.mail_queue,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      club_member_table: props.club_member_table,
      registrations_table: props.registrations_table,
      users_table: props.users_table,
      club_table: props.club_table,
      transactions_table: props.transactions_table,
      billing_table: props.billing_table,
      orders_table: props.orders_table,
      product_table: props.product_table,
      kms_key: props.kms_key,
      event_registrations_table: props.event_registrations_table,
      events_table: props.events_table,
    });

    new MSC_EventsConstruct(this, `${id}-Events`, {
      api_gateway: api_gateway,
      layers: all_layers,
      token_authorizer: jwt_construct.token_authorizer,
      events_table: props.events_table,
      club_member_table: props.club_member_table,
      event_registrations_table: props.event_registrations_table,
      transactions_table: props.transactions_table,
    });

    new MSC_TransactionsConstruct(this, `${id}-Transactions`, {
      api_gateway: api_gateway,
      layers: all_layers,
      token_authorizer: jwt_construct.token_authorizer,
      transactions_table: props.transactions_table,
    });

    new MSC_ImagesConstruct(this, `${id}-Images`, {
      api_gateway: api_gateway,
      club_table: props.club_table,
      image_bucket: props.image_bucket,
      layers: all_layers,
      token_authorizer: jwt_construct.token_authorizer,
    });

    new MSC_ClubMemberConstruct(this, `${id}-ClubMember`, {
      api_gateway: api_gateway,
      signatures_bucket: props.signatures_bucket,
      club_member_table: props.club_member_table,
      registrations_table: props.registrations_table,
      registration_form_table: props.registration_form_table,
      users_table: props.users_table,
      club_table: props.club_table,
      token_authorizer: jwt_construct.token_authorizer,
      transactions_table: props.transactions_table,
      layers: all_layers,
      mail_queue: props.mail_queue,
      billing_table: props.billing_table,
      kms_key: props.kms_key,
    });

    new MSC_MemberRegistrationFormConstruct(this, `${id}-RegistrationForm`, {
      api_gateway: api_gateway,
      registration_form_table: props.registration_form_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      club_table: props.club_table,
      club_member_table: props.club_member_table,
      registrations_table: props.registrations_table,
      signatures_bucket: props.signatures_bucket,
      kms_key: props.kms_key,
      image_bucket: props.image_bucket,
    });

    new MSC_MemberClubConstruct(this, `${id}-Club`, {
      api_gateway: api_gateway,
      club_table: props.club_table,
      registration_form_table: props.registration_form_table,
      registrations_table: props.registrations_table,
      club_member_table: props.club_member_table,
      token_authorizer: jwt_construct.token_authorizer,
      image_bucket: props.image_bucket,
      layers: all_layers,
      signatures_bucket: props.signatures_bucket,
      transactions_table: props.transactions_table,
    });

    new MSC_MemberUserConstruct(this, `${id}-User`, {
      api_gateway: api_gateway,
      club_member_table: props.club_member_table,
      users_table: props.users_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      kms_key: props.kms_key,
    });

    new MSC_StorageConstruct(this, `${id}-Storage`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      storage_table: props.storage_table,
      club_table: props.club_table,
      layers: all_layers,
    });

    new MSC_StorageRequestConstruct(this, `${id}-StorageRequest`, {
      api_gateway: api_gateway,
      storage_table: props.storage_table,
      storage_request_table: props.storage_requests_table,
      club_table: props.club_table,
      transactions_table: props.transactions_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      club_member_table: props.club_member_table,
    });
  }
}
