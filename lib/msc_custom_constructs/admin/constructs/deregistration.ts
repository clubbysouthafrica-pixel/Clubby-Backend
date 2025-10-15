import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_Queue } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface MSC_DeregistrationConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    billing_table: MSC_Table;
    transactions_table: MSC_Table;
    club_reporting_table: MSC_Table;
    club_deregistraiton_queue: MSC_Queue;
    registrations_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    club_history_bucket: MSC_Bucket;
    layers: MSC_Layers;
}

export class MSC_DeregistrationConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_DeregistrationConstructProps) {
        super(scope, id);

        const process_deregister_season = new MSC_Lambda(this, `${id}-ProcessDeregisterSeason`, {
            code: "admin/deregistration/process_deregister_season",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                DEREGISTRATION_QUEUE_URL: props.club_deregistraiton_queue.queueUrl
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.club_deregistraiton_queue.queueArn]: [
                    "sqs:SendMessage"
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
                CLUB_REPORTING_TABLE_NAME: props.club_reporting_table.tableName,
                BILLING_TABLE_NAME: props.billing_table.tableName
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
                [props.club_reporting_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:DeleteItem"
                ],
                [props.billing_table.tableArn]: [
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
                ]
            },
            timeout: 840,
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });
        props.club_history_bucket.grantPut(deregister_season);
        deregister_season.addEventSource(new SqsEventSource(props.club_deregistraiton_queue, {
            batchSize: 1
        }));

        const deregister_members = new MSC_Lambda(this, `${id}-DeregisterMembers`, {
            code: "admin/deregistration/deregister_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_REPORTING_TABLE_NAME: props.club_reporting_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.club_reporting_table.tableArn]: [
                    "dynamodb:UpdateItem"
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
