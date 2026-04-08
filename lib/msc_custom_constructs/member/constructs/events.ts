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
    club_member_table: MSC_Table;
    event_registrations_table: MSC_Table;
    transactions_table: MSC_Table;
}

export class MSC_EventsConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_EventsProps) {
        super(scope, id);

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

        const register = new MSC_Lambda(this, `${id}-Register`, {
            code: "member/events/register",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                EVENT_TABLE_NAME: props.events_table.tableName
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.events_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.event_registrations_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_event_registrations = new MSC_Lambda(this, `${id}-GetEventRegistrations`, {
            code: "member/events/get_event_registrations",
            envVariables: {
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName,
                EVENT_REGISTRATIONS_USER_ID_INDEX: "UserIDIndex",
            },
            permissions: {
                [`${props.event_registrations_table.tableArn}/index/UserIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const events_resource = props.api_gateway.root.addResource("events");

        const get_events_resource = events_resource.addResource("getEvents");
        const register_resource = events_resource.addResource("register");
        const get_event_registrations_resource = events_resource.addResource("getEventRegistrations");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_events_resource, get_events, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(register_resource, register, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_event_registrations_resource, get_event_registrations, methodOptions, undefined, "GET");
    }
}
