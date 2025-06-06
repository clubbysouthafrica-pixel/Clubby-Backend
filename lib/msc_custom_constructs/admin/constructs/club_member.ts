import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ClubMemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_ClubMemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberClubConstructProps) {
        super(scope, id);

        const get_all_club_members = new MSC_Lambda(this, `${id}-CreateClub`, {
            code: "admin/club_member/get_all_club_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex"
            },
            permissions: {
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ]
            }
        });

        const club_member_resource = props.api_gateway.root.addResource("clubMember");

        const get_all_club_members_resource = club_member_resource.addResource("getAllClubMembers");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_all_club_members_resource, get_all_club_members, methodOptions, undefined, "GET");
    }
}
