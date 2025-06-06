import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, LambdaIntegration, MethodOptions, MockIntegration, PassthroughBehavior, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_MemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberClubConstructProps) {
        super(scope, id);

        const get_club = new MSC_Lambda(this, `${id}-GetClub`, {
            code: "member/club/get_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const get_all_clubs = new MSC_Lambda(this, `${id}-GetAllClubs`, {
            code: "member/club/get_all_clubs",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:Scan"
                ]
            }
        });

        const club_resource = props.api_gateway.root.addResource("club");

        const get_club_resource = club_resource.addResource("getClub");
        const get_all_clubs_resource = club_resource.addResource("getAllClubs");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_resource, get_club, methodOptions, undefined, "GET");
        addCorsEnabledMethod(get_all_clubs_resource, get_all_clubs, methodOptions, undefined, "GET");
    }
}
