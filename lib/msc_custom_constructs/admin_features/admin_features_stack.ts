import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MSC_APIGateway, MSC_Cognito, MSC_LambdaLayer } from '../../msc_service_constructs';
import {
    MSC_BookingsConstruct,
    MSC_VenuesConstruct
} from "./constructs";
import { MSC_JWTConstruct } from "../authorization";
import { MSC_Table } from "../../msc_service_constructs";

export interface MSC_AdminFeaturesNestedStackProps extends StackProps {
    admin_user_pool: MSC_Cognito;
    venues_table: MSC_Table;
    venues_bookings_table: MSC_Table;
    club_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        jwks_rsa_layer: MSC_LambdaLayer;
        axios_layer: MSC_LambdaLayer;
    };
}

export class MSC_AdminFeaturesNestedStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_AdminFeaturesNestedStackProps) {
        super(scope, id, props);
        console.log('ADMIN_FEATURES_CERT_ARN: ', process.env.ADMIN_FEATURES_CERT_ARN);
        const api_gateway = new MSC_APIGateway(this, id, {
            domain: "admin-features",
            cert_arn: process.env.ADMIN_FEATURES_CERT_ARN as string
        });

        const jwt_construct = new MSC_JWTConstruct(this, `${id}-Auth`, {
            api_gateway: api_gateway,
            user_pool: props.admin_user_pool,
            user_type: "admin",
            layers: props.layers
        });

        new MSC_VenuesConstruct(this, `${id}-BookingVenues`, {
            api_gateway: api_gateway,
            token_authorizer: jwt_construct.token_authorizer,
            venues_table: props.venues_table,
            layers: props.layers,
            club_table: props.club_table
        });

        new MSC_BookingsConstruct(this, `${id}-Bookings`, {
            api_gateway: api_gateway,
            layers: props.layers,
            token_authorizer: jwt_construct.token_authorizer,
            venues_bookings_table: props.venues_bookings_table
        });
    }
}