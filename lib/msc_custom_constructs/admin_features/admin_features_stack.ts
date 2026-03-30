import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  MSC_APIGateway,
  MSC_Bucket,
  MSC_Cognito,
} from "../../msc_service_constructs";
import {
  MSC_BookingsConstruct,
  MSC_VenuesConstruct,
  MSC_AdminShopConstruct,
  MSC_AdminOrdersConstruct,
  MSC_EventsConstruct,
  MSC_StorageRequestConstruct,
  MSC_StorageConstruct,
} from "./constructs";
import { MSC_JWTConstruct } from "../authorization";
import { MSC_Table } from "../../msc_service_constructs";
import { MSC_Layers } from "../lambda_layers";

export interface MSC_AdminFeaturesNestedStackProps extends StackProps {
  admin_user_pool: MSC_Cognito;
  venues_table: MSC_Table;
  venues_bookings_table: MSC_Table;
  club_table: MSC_Table;
  product_table: MSC_Table;
  orders_table: MSC_Table;
  transactions_table: MSC_Table;
  billing_table: MSC_Table;
  events_table: MSC_Table;
  event_registrations_table: MSC_Table;
  shop_images_bucket: MSC_Bucket;
}

export class MSC_AdminFeaturesNestedStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: MSC_AdminFeaturesNestedStackProps,
  ) {
    super(scope, id, props);

    const all_layers = new MSC_Layers(this, id, {});

    const api_gateway = new MSC_APIGateway(this, id, {
      domain: "admin-features",
      cert_arn: process.env.ADMIN_FEATURES_CERT_ARN as string,
    });

    const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
      api_gateway: api_gateway,
      user_pool: props.admin_user_pool,
      user_type: "admin",
      layers: all_layers,
    });

    new MSC_AdminShopConstruct(this, `${id}-Shop`, {
      api_gateway: api_gateway,
      product_table: props.product_table,
      token_authorizer: jwt_construct.token_authorizer,
      shop_images_bucket: props.shop_images_bucket,
      layers: all_layers,
    });

    new MSC_VenuesConstruct(this, `${id}-BookingVenues`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      venues_table: props.venues_table,
      layers: all_layers,
      club_table: props.club_table,
    });

    new MSC_AdminOrdersConstruct(this, `${id}-Orders`, {
      api_gateway: api_gateway,
      orders_table: props.orders_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      club_table: props.club_table,
      transactions_table: props.transactions_table,
      product_table: props.product_table,
      billing_table: props.billing_table,
    });

    new MSC_EventsConstruct(this, `${id}-Events`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      layers: all_layers,
      events_table: props.events_table,
      event_registrations_table: props.event_registrations_table,
      transactions_table: props.transactions_table,
    });

    new MSC_BookingsConstruct(this, `${id}-Bookings`, {
      api_gateway: api_gateway,
      layers: all_layers,
      token_authorizer: jwt_construct.token_authorizer,
      venues_bookings_table: props.venues_bookings_table,
    });

    new MSC_StorageConstruct(this, `${id}-Storage`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      storage_table: props.storage_table,
      club_table: props.club_table,
      layers: all_layers,
    });

    new MSC_StorageRequestConstruct(this, `${id}-StorageRequests`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      storage_requests_table: props.storage_requests_table,
      club_table: props.club_table,
      layers: all_layers,
    });
  }
}
