import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_AdminClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
}

export class MSC_AdminClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminClubConstructProps) {
        super(scope, id);

        const create_club = new MSC_Lambda(this, `${id}-CreateClub`, {
            code: "admin/club/create_club",
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

        // const methodOptions: MethodOptions = {
        //     methodResponses: [],
        //     authorizationType: AuthorizationType.CUSTOM,
        //     authorizer: props.token_authorizer
        // }

        addCorsEnabledMethod(create_club_resource, create_club, { methodResponses: [] }, undefined, "PUT");
    }
}
