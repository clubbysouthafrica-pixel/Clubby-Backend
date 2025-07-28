import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_ReportingConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
}

export class MSC_ReportingConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ReportingConstructProps) {
        super(scope, id);

        const general_reporting = new MSC_Lambda(this, `${id}-GeneralReporting`, {
            code: "admin/reporting/general_reporting",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex"
            },
            permissions: {
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const reporting_resource = props.api_gateway.root.addResource("reporting");

        const general_reporting_resource = reporting_resource.addResource("generalReporting");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(general_reporting_resource, general_reporting, methodOptions, undefined, "GET");
    }
}
