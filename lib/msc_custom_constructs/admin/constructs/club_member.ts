import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Queue } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_ClubMemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    registration_form_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    billing_queue: MSC_Queue,
    layers: MSC_Layers;
}

export class MSC_ClubMemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberClubConstructProps) {
        super(scope, id);

        const get_all_club_members = new MSC_Lambda(this, `${id}-GetAllClubMembers`, {
            code: "admin/club_member/get_all_club_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex"
            },
            permissions: {
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const register_member = new MSC_Lambda(this, `${id}-RegisterMember`, {
            code: "admin/club_member/register_member",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                BILLING_QUEUE_URL: props.billing_queue.queueUrl,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.billing_queue.queueArn]: [
                    "sqs:SendMessage"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

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
