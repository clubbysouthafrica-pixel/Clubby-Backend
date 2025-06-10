import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, LambdaIntegration, MethodOptions, MockIntegration, PassthroughBehavior, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ClubMemberConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    registration_form_table: MSC_Table;
    users_table: MSC_Table;
}

export class MSC_ClubMemberConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberConstructProps) {
        super(scope, id);

        const submit_registration = new MSC_Lambda(this, `${id}-SubmitRegistration`, {
            code: "member/club_member/submit_registration",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const get_club_member = new MSC_Lambda(this, `${id}-GetClubMember`, {
            code: "member/club_member/get_club_member",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const get_all_member_clubs = new MSC_Lambda(this, `${id}-GetAllMemberClubs`, {
            code: "member/club_member/get_all_member_clubs",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:Query"
                ]
            }
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
