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
    event_registrations_table: MSC_Table;
    transactions_table: MSC_Table;
    billing_table: MSC_Table;
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

        const get_event_registrations = new MSC_Lambda(this, `${id}-GetEventRegistrations`, {
            code: "admin_features/events/get_event_registrations",
            envVariables: {
                EVENTS_TABLE_NAME: props.events_table.tableName,
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName
            },
            permissions: {
                [props.events_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.event_registrations_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_event_registration = new MSC_Lambda(this, `${id}-GetEventRegistration`, {
            code: "admin_features/events/get_event_registration",
            envVariables: {
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName
            },
            permissions: {
                [props.event_registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const confirm_payment = new MSC_Lambda(this, `${id}-ConfirmPayment`, {
            code: "admin_features/events/confirm_payment",
            envVariables: {
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                EVENTS_TABLE_NAME: props.events_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName
            },
            permissions: {
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.event_registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                ],
                [props.events_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const confirm_registration = new MSC_Lambda(this, `${id}-ConfirmRegistration`, {
            code: "admin_features/events/confirm_registration",
            envVariables: {
                EVENTS_TABLE_NAME: props.events_table.tableName,
                EVENT_REGISTRATIONS_TABLE_NAME: props.event_registrations_table.tableName,
            },
            permissions: {
                [props.events_table.tableArn]: [
                    "dynamodb:GetItem",
                ],
                [props.event_registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                ],
            },
            layers: [props.layers.jwt_layer]
        });

        const delete_event = new MSC_Lambda(this, `${id}-DeleteEvent`, {
            code: "admin_features/events/delete_event",
            envVariables: {
                EVENTS_TABLE_NAME: props.events_table.tableName,
            },
            permissions: {
                [props.events_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:DeleteItem",
                ],
            },
            layers: [props.layers.jwt_layer]
        });

        const events_resource = props.api_gateway.root.addResource("events");

        const create_or_update_events_resource = events_resource.addResource("createOrUpdateEvents");
        const get_events_resource = events_resource.addResource("getEvents");
        const get_event_registrations_resource = events_resource.addResource("getEventRegistrations");
        const get_event_registration_resource = events_resource.addResource("getEventRegistration");
        const confirm_payment_resource = events_resource.addResource("confirmPayment");
        const confirm_registration_resource = events_resource.addResource("confirmRegistration");
        const delete_event_resource = events_resource.addResource("deleteEvent");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_or_update_events_resource, create_or_update_events, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_events_resource, get_events, methodOptions, undefined, "GET");
        addCorsEnabledMethod(get_event_registrations_resource, get_event_registrations, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_event_registration_resource, get_event_registration, methodOptions, undefined, "GET");
        addCorsEnabledMethod(confirm_payment_resource, confirm_payment, methodOptions, undefined, "POST");
        addCorsEnabledMethod(confirm_registration_resource, confirm_registration, methodOptions, undefined, "POST");
        addCorsEnabledMethod(delete_event_resource, delete_event, methodOptions, undefined, "POST");
    }
}
