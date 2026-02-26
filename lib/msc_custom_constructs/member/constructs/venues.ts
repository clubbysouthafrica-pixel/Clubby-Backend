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

        const get_venues = new MSC_Lambda(this, `${id}-GetVenues`, {
            code: "member/venues/get_venues",
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

        const get_venues_resource = venues_resource.addResource("getVenues");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_venues_resource, get_venues, methodOptions, undefined, "GET");
    }
}
