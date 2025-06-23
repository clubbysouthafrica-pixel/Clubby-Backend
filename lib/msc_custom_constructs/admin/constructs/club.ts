import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
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

        const get_club = new MSC_Lambda(this, `${id}-GetClub`, {
            code: "admin/club/get_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_club_details = new MSC_Lambda(this, `${id}-UpdateClubDetails`, {
            code: "admin/club/update_club_details",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const club_resource = props.api_gateway.root.addResource("club");

        const create_club_resource = club_resource.addResource("createClub");
        const get_club_resource = club_resource.addResource("getClub");
        const update_club_details_resource = club_resource.addResource("updateClubDetails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_club_resource, create_club, { methodResponses: [] }, undefined, "PUT");
        addCorsEnabledMethod(get_club_resource, get_club, methodOptions, undefined, "GET");
        addCorsEnabledMethod(update_club_details_resource, update_club_details, methodOptions, undefined, "POST");
    }
}
