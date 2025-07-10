import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_InternalInfraClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_InternalInfraClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_InternalInfraClubConstructProps) {
        super(scope, id);

        const create_club = new MSC_Lambda(this, `${id}-CreateClub`, {
            code: "internal_infra/club/create_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                ADMIN_TOKEN: "FHJ289489JDJD"
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const club_resource = props.api_gateway.root.addResource("club");

        const create_club_resource = club_resource.addResource("createClub");

        addCorsEnabledMethod(create_club_resource, create_club, { methodResponses: [] }, undefined, "PUT");
    }
}
