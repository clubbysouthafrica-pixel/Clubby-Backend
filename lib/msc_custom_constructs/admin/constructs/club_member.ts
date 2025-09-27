import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_Queue } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface MSC_ClubMemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    transactions_table: MSC_Table;
    club_member_table: MSC_Table;
    update_registration_reporting_queue: MSC_Queue;
    club_table: MSC_Table;
    registration_form_table: MSC_Table;
    registration_reporting_table: MSC_Table;
    registrations_table: MSC_Table;
    club_reporting_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
    billing_table: MSC_Table;
}

export class MSC_ClubMemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberClubConstructProps) {
        super(scope, id);

        const get_all_club_members = new MSC_Lambda(this, `${id}-GetAllClubMembers`, {
            code: "admin/club_member/get_all_club_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName
            },
            permissions: {
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const register_member = new MSC_Lambda(this, `${id}-RegisterMember`, {
            code: "admin/club_member/register_member",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_REPORTING_TABLE_NAME: props.club_reporting_table.tableName,
                UPDATE_REGISTRATION_REPORTING_QUEUE_URL: props.update_registration_reporting_queue.queueUrl
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.club_reporting_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.update_registration_reporting_queue.queueArn]: [
                    "sqs:SendMessage"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_registration_reporting = new MSC_Lambda(this, `${id}-UpdateRegistrationReporting`, {
            code: "admin/club_member/update_registration_reporting",
            envVariables: {
                REGISTRATION_REPORTING_TABLE_NAME: props.registration_reporting_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName
            },
            permissions: {
                [props.registration_reporting_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:PutItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        })
        update_registration_reporting.addEventSource(new SqsEventSource(props.update_registration_reporting_queue, {
            batchSize: 1
        }));

        const club_member_resource = props.api_gateway.root.addResource("clubMember");

        const get_all_club_members_resource = club_member_resource.addResource("getAllClubMembers");
        const register_member_resource = club_member_resource.addResource("registerMember");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_all_club_members_resource, get_all_club_members, methodOptions, undefined, "GET");
        addCorsEnabledMethod(register_member_resource, register_member, methodOptions);
    }
}
