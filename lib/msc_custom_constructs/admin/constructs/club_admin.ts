import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_ClubAdminClubConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    club_admin_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_ClubAdminClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ClubAdminClubConstructProps) {
        super(scope, id);

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

        const get_all_admin_clubs_resource = admin_club_resource.addResource("getAllAdminClubs");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_all_admin_clubs_resource, get_all_admin_clubs, methodOptions, undefined, "GET");
    }
}
