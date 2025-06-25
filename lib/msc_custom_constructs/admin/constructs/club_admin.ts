import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_ClubAdminClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    users_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    club_admin_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_ClubAdminClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubAdminClubConstructProps) {
        super(scope, id);

        const associate_user_with_club = new MSC_Lambda(this, `${id}-AssociateAdminWithClub`, {
            code: "admin/club_admin/associate_user_with_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName,
                CLUB_ADMIN_ACCOUNT_TABLE_NAME: props.club_admin_table.tableName,
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_admin_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_all_admin_clubs = new MSC_Lambda(this, `${id}-GetAllAdminClubs`, {
            code: "admin/club_admin/get_all_admin_clubs",
            envVariables: {
                CLUB_ADMIN_TABLE_NAME: props.club_admin_table.tableName,
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [props.club_admin_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const admin_club_resource = props.api_gateway.root.addResource("clubAdmin");

        const associate_user_with_club_resource = admin_club_resource.addResource("associateUserWithClub");
        const get_all_admin_clubs_resource = admin_club_resource.addResource("getAllAdminClubs");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(associate_user_with_club_resource, associate_user_with_club, { methodResponses: [] }, undefined, "PUT");
        addCorsEnabledMethod(get_all_admin_clubs_resource, get_all_admin_clubs, methodOptions, undefined, "GET");
    }
}
