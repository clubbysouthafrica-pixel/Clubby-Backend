import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_VenuesConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    venues_table: MSC_Table;
    club_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_VenuesConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_VenuesConstructProps) {
        super(scope, id);

        const create_venue = new MSC_Lambda(this, `${id}-CreateVenue`, {
            code: "admin_features/venues/create_venue",
            envVariables: {
                VENUES_TABLE_NAME: props.venues_table.tableName
            },
            permissions: {
                [props.venues_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const enable_venues = new MSC_Lambda(this, `${id}-EnableVenues`, {
            code: "admin_features/venues/enable_venues",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_venues = new MSC_Lambda(this, `${id}-GetVenues`, {
            code: "admin_features/venues/get_venues",
            envVariables: {
                VENUES_TABLE_NAME: props.venues_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.venues_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const venues_resource = props.api_gateway.root.addResource("venues");

        const create_venue_resource = venues_resource.addResource("createVenue");
        const get_venues_resource = venues_resource.addResource("getVenues");
        const enable_venues_resource = venues_resource.addResource("enableVenues");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_venue_resource, create_venue, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_venues_resource, get_venues, methodOptions, undefined, "GET");
        addCorsEnabledMethod(enable_venues_resource, enable_venues, methodOptions, undefined, "POST");
    }
}
