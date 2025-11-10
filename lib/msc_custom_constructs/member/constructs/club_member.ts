import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_Queue, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ClubMemberConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    registration_form_table: MSC_Table;
    club_reporting_table: MSC_Table;
    transactions_table: MSC_Table;
    club_table: MSC_Table,
    users_table: MSC_Table;
    signatures_bucket: MSC_Bucket;
    registrations_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    mail_queue: MSC_Queue;
    billing_table: MSC_Table;
}

export class MSC_ClubMemberConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberConstructProps) {
        super(scope, id);

        const submit_registration = new MSC_Lambda(this, `${id}-SubmitRegistration`, {
            code: "member/club_member/submit_registration",
            envVariables: {
                DOMAIN: process.env.DOMAIN as string,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_REPORTING_TABLE_NAME: props.club_reporting_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:Query",
                    "dynamodb:PutItem",
                    "dynamodb:DeleteItem"
                ],
                [props.club_reporting_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.signatures_bucket.grantPut(submit_registration)

        const get_club_member = new MSC_Lambda(this, `${id}-GetClubMember`, {
            code: "member/club_member/get_club_member",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_all_member_clubs = new MSC_Lambda(this, `${id}-GetAllMemberClubs`, {
            code: "member/club_member/get_all_member_clubs",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const club_resource = props.api_gateway.root.addResource("clubMember");

        const get_club_member_resource = club_resource.addResource("getClubMember");
        const submit_registration_resource = club_resource.addResource("submitRegistration");
        const get_all_member_clubs_resource = club_resource.addResource("getAllMemberClubs");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_member_resource, get_club_member, methodOptions, undefined, "GET");
        addCorsEnabledMethod(get_all_member_clubs_resource, get_all_member_clubs, methodOptions, undefined, "GET");
        addCorsEnabledMethod(submit_registration_resource, submit_registration, methodOptions, undefined, "PUT");
    }
}
