import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_Cognito, MSC_Queue, MSC_LambdaLayer, MSC_Kms } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

interface MSC_ClubMemberClubConstructProps {
    users_table: MSC_Table;
    api_gateway: MSC_APIGateway;
    member_user_pool: MSC_Cognito;
    transactions_table: MSC_Table;
    club_member_table: MSC_Table;
    club_table: MSC_Table;
    registration_form_table: MSC_Table;
    registrations_table: MSC_Table;
    signatures_bucket: MSC_Bucket;
    token_authorizer: TokenAuthorizer;
    mail_queue: MSC_Queue;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    billing_table: MSC_Table;
    kms_key: MSC_Kms;
}

export class MSC_ClubMemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberClubConstructProps) {
        super(scope, id);

        const get_all_club_members = new MSC_Lambda(this, `${id}-GetAllClubMembers`, {
            code: "admin/club_member/get_all_club_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName
            },
            permissions: {
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query",
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [`${props.registrations_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Decrypt"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const submit_registration = new MSC_Lambda(this, `${id}-SubmitRegistration`, {
            code: "admin/club_member/submit_registration",
            envVariables: {
                DOMAIN: process.env.DOMAIN as string,
                USER_POOL_ID: props.member_user_pool.userPoolId,
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER",
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
                KMS_KEY_ID: props.kms_key.keyId
            },
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ],
                [props.member_user_pool.userPoolArn]: [
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminGetUser"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem"
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
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Encrypt",
                    "kms:GenerateDataKey"
                ]
            },
            layers: [props.layers.jwt_layer],
            retention: RetentionDays.ONE_MONTH
        });
        props.signatures_bucket.grantPut(submit_registration)

        const register_member = new MSC_Lambda(this, `${id}-RegisterMember`, {
            code: "admin/club_member/register_member",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                SEND_EMAIL_QUEUE_URL: props.mail_queue.queueUrl,
            },
            permissions: {
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.billing_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.mail_queue.queueArn]: [
                    "sqs:SendMessage"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const remove_member = new MSC_Lambda(this, `${id}-RemoveMember`, {
            code: "admin/club_member/remove_member",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:DeleteItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:DeleteItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_variables = new MSC_Lambda(this, `${id}-UpdateVariables`, {
            code: "admin/club_member/update_variables",
            envVariables: {
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName
            },
            permissions: {
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_club_member = new MSC_Lambda(this, `${id}-GetClubMember`, {
            code: "admin/club_member/get_club_member",
            envVariables: {
                USER_TYPE: "MEMBER",
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_REGISTRATION_TABLE_NAME: props.registrations_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const club_member_resource = props.api_gateway.root.addResource("clubMember");

        const get_all_club_members_resource = club_member_resource.addResource("getAllClubMembers");
        const register_member_resource = club_member_resource.addResource("registerMember");
        const submit_registration_resource = club_member_resource.addResource("submitRegistration");
        const remove_member_resource = club_member_resource.addResource("removeMember");
        const update_variables_resource = club_member_resource.addResource("updateVariables");
        const get_club_member_resource = club_member_resource.addResource("getClubMember");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_all_club_members_resource, get_all_club_members, methodOptions, undefined, "POST");
        addCorsEnabledMethod(register_member_resource, register_member, methodOptions);
        addCorsEnabledMethod(submit_registration_resource, submit_registration, { methodResponses: [] })
        addCorsEnabledMethod(remove_member_resource, remove_member, methodOptions, undefined, "POST");
        addCorsEnabledMethod(update_variables_resource, update_variables, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_club_member_resource, get_club_member, { methodResponses: [] }, undefined, "GET");
    }
}
