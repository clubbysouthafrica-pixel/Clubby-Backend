import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_MemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
}

export class MSC_MemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberClubConstructProps) {
        super(scope, id);

        const get_club = new MSC_Lambda(this, `${id}-GetClub`, {
            code: "member/club/get_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
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
            },
            layers: [props.layers.jwt_layer]
        });

        const club_resource = props.api_gateway.root.addResource("club");

        const get_club_resource = club_resource.addResource("getClub");
        const get_all_clubs_resource = club_resource.addResource("getAllClubs");

        addCorsEnabledMethod(get_club_resource, get_club, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(get_all_clubs_resource, get_all_clubs, { methodResponses: [] }, undefined, "GET");
    }
}
