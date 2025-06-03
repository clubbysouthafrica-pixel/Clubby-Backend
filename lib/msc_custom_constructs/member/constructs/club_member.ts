import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, LambdaIntegration, MethodOptions, MockIntegration, PassthroughBehavior, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ClubMemberConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_ClubMemberConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubMemberConstructProps) {
        super(scope, id);

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

        const club_resource = props.api_gateway.root.addResource("clubMember");

        const get_club_member_resource = club_resource.addResource("getClubMember");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_member_resource, get_club_member, methodOptions);
    }
}
