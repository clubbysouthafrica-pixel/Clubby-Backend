import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_Queue, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface MSC_DeregistrationConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    billing_table: MSC_Table;
    transactions_table: MSC_Table;
    club_deregistration_queue: MSC_Queue;
    registrations_table: MSC_Table;
    orders_table: MSC_Table;
    registration_form_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    club_history_bucket: MSC_Bucket;
    signatures_bucket: MSC_Bucket;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_DeregistrationConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_DeregistrationConstructProps) {
        super(scope, id);

        const process_deregister_season = new MSC_Lambda(this, `${id}-ProcessDeregisterSeason`, {
            code: "admin/deregistration/process_deregister_season",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                DEREGISTRATION_QUEUE_URL: props.club_deregistration_queue.queueUrl,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex"
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.club_deregistration_queue.queueArn]: [
                    "sqs:SendMessage"
                ],
                [`${props.billing_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            timeout: 10,
            layers: [props.layers.jwt_layer]
        });

        const deregister_season = new MSC_Lambda(this, `${id}-DeregisterSeason`, {
            code: "admin/deregistration/deregister_season",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                HISTORICAL_REPORTING_BUCKET_NAME: props.club_history_bucket.bucketName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_MEMBER_CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                BILLING_TABLE_NAME: props.billing_table.tableName,
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                ORDERS_TABLE_NAME: props.orders_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:DeleteItem"
                ],
                [props.orders_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:DeleteItem"
                ],
                [`${props.registrations_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:DeleteItem",
                    "dynamodb:UpdateItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:DeleteItem"
                ],
                [props.signatures_bucket.bucketArn]: [
                    "s3:ListBucket"
                ],
                [`${props.signatures_bucket.bucketArn}/*`]: [
                    "s3:DeleteObject"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:DeleteItem"
                ]
            },
            timeout: 840,
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });
        props.club_history_bucket.grantPut(deregister_season);
        deregister_season.addEventSource(new SqsEventSource(props.club_deregistration_queue, {
            batchSize: 1
        }));

        const deregister_members = new MSC_Lambda(this, `${id}-DeregisterMembers`, {
            code: "admin/deregistration/deregister_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                ORDERS_INDEX_NAME: "UserIDIndex"
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [`${props.orders_table.tableArn}/index/UserIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            timeout: 360,
            layers: [props.layers.jwt_layer]
        });

        const deregistration_resource = props.api_gateway.root.addResource("deregistration");

        const deregister_season_resource = deregistration_resource.addResource("season");
        const deregister_members_resource = deregistration_resource.addResource("members");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(deregister_season_resource, process_deregister_season, methodOptions);
        addCorsEnabledMethod(deregister_members_resource, deregister_members, methodOptions);
    }
}
