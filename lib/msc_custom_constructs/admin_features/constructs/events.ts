import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Bucket, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_EventsProps {
    api_gateway: MSC_APIGateway;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    token_authorizer: TokenAuthorizer;
    events_table: MSC_Table;
}

export class MSC_EventsConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_EventsProps) {
        super(scope, id);

        const create_or_update_events = new MSC_Lambda(this, `${id}-CreateOrUpdateEvents`, {
            code: "admin_features/events/create_or_update_events",
            envVariables: {
                EVENTS_TABLE_NAME: props.events_table.tableName
            },
            permissions: {
                [props.events_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_events = new MSC_Lambda(this, `${id}-GetEvents`, {
            code: "admin_features/events/get_events",
            envVariables: {
                EVENTS_TABLE_NAME: props.events_table.tableName
            },
            permissions: {
                [props.events_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const events_resource = props.api_gateway.root.addResource("events");

        const create_or_update_events_resource = events_resource.addResource("createOrUpdateEvents");
        const get_events_resource = events_resource.addResource("getEvents");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_or_update_events_resource, create_or_update_events, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_events_resource, get_events, methodOptions, undefined, "GET");
    }
}
