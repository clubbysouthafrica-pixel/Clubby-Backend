import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";

interface MSC_InternalInfraClubAdminConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    users_table: MSC_Table;
    club_admin_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    }
}

export class MSC_InternalInfraClubAdminConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraClubAdminConstructProps) {
        super(scope, id);

        const associate_admin_with_club = new MSC_Lambda(this, `${id}-AssociateAdminWithClub`, {
            code: "internal_infra/club_admin/associate_admin_with_club",
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

        const admin_club_resource = props.api_gateway.root.addResource("clubAdmin");

        const associate_user_with_club_resource = admin_club_resource.addResource("associateUserWithClub");

        addCorsEnabledMethod(associate_user_with_club_resource, associate_admin_with_club, { methodResponses: [] }, undefined, "PUT");
    }
}
