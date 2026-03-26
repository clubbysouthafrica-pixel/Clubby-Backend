import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  MSC_APIGateway,
  MSC_Bucket,
  MSC_Cognito,
  MSC_LambdaLayer,
} from "../../msc_service_constructs";
import {
  MSC_BookingsConstruct,
  MSC_StorageConstruct,
  MSC_VenuesConstruct,
  MSC_AdminShopConstruct,
  MSC_AdminOrdersConstruct,
  MSC_StorageRequestConstruct,
} from "./constructs";
import { MSC_JWTConstruct } from "../authorization";
import { MSC_Table } from "../../msc_service_constructs";

export interface MSC_AdminFeaturesNestedStackProps extends StackProps {
  admin_user_pool: MSC_Cognito;
  venues_table: MSC_Table;
  venues_bookings_table: MSC_Table;
  club_table: MSC_Table;
  storage_table: MSC_Table;
  storage_requests_table: MSC_Table;
  product_table: MSC_Table;
  orders_table: MSC_Table;
  transactions_table: MSC_Table;
  billing_table: MSC_Table;
  shop_images_bucket: MSC_Bucket;
  layers: {
    jwt_layer: MSC_LambdaLayer;
    jwks_rsa_layer: MSC_LambdaLayer;
    axios_layer: MSC_LambdaLayer;
  };
}

export class MSC_AdminFeaturesNestedStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: MSC_AdminFeaturesNestedStackProps,
  ) {
    super(scope, id, props);

    const api_gateway = new MSC_APIGateway(this, id, {
      domain: "admin-features",
      cert_arn: process.env.ADMIN_FEATURES_CERT_ARN as string,
    });

    const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
      api_gateway: api_gateway,
      user_pool: props.admin_user_pool,
      user_type: "admin",
      layers: props.layers,
    });

    new MSC_AdminShopConstruct(this, `${id}-Shop`, {
      api_gateway: api_gateway,
      product_table: props.product_table,
      token_authorizer: jwt_construct.token_authorizer,
      shop_images_bucket: props.shop_images_bucket,
      layers: props.layers,
    });

    new MSC_VenuesConstruct(this, `${id}-BookingVenues`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      venues_table: props.venues_table,
      layers: props.layers,
      club_table: props.club_table,
    });

    new MSC_AdminOrdersConstruct(this, `${id}-Orders`, {
      api_gateway: api_gateway,
      orders_table: props.orders_table,
      token_authorizer: jwt_construct.token_authorizer,
      layers: props.layers,
      club_table: props.club_table,
      transactions_table: props.transactions_table,
      product_table: props.product_table,
      billing_table: props.billing_table,
    });

    new MSC_BookingsConstruct(this, `${id}-Bookings`, {
      api_gateway: api_gateway,
      layers: props.layers,
      token_authorizer: jwt_construct.token_authorizer,
      venues_bookings_table: props.venues_bookings_table,
    });

    new MSC_StorageConstruct(this, `${id}-Storage`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      storage_table: props.storage_table,
      club_table: props.club_table,
      layers: props.layers,
    });

    new MSC_StorageRequestConstruct(this, `${id}-StorageRequests`, {
      api_gateway: api_gateway,
      token_authorizer: jwt_construct.token_authorizer,
      storage_table: props.storage_table,
      club_table: props.club_table,
      layers: props.layers,
    });
  }
}
