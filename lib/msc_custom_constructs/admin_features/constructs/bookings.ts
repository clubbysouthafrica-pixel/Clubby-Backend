import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Bucket, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_BookingsProps {
    api_gateway: MSC_APIGateway;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    venues_bookings_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_BookingsConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_BookingsProps) {
        super(scope, id);

        const create_bookings = new MSC_Lambda(this, `${id}-CreateBookings`, {
            code: "admin_features/bookings/create_booking",
            envVariables: {
                VENUES_BOOKINGS_TABLE_NAME: props.venues_bookings_table.tableName
            },
            permissions: {
                [props.venues_bookings_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_bookings = new MSC_Lambda(this, `${id}-GetBookings`, {
            code: "admin_features/bookings/get_bookings",
            envVariables: {
                VENUES_BOOKINGS_TABLE_NAME: props.venues_bookings_table.tableName
            },
            permissions: {
                [props.venues_bookings_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const bookings_resource = props.api_gateway.root.addResource("bookings");

        const create_booking_resource = bookings_resource.addResource("createBooking");
        const get_bookings_resource = bookings_resource.addResource("getBookings");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_booking_resource, create_bookings, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_bookings_resource, get_bookings, methodOptions, undefined, "GET");
    }
}
