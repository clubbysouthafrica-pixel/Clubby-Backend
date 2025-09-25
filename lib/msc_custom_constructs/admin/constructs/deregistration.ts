import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_DeregistrationConstructProps {
    api_gateway: MSC_APIGateway;
    club_member_table: MSC_Table;
    club_reporting_table: MSC_Table;
    registrations_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    club_history_bucket: MSC_Bucket;
    layers: MSC_Layers;
}

export class MSC_DeregistrationConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_DeregistrationConstructProps) {
        super(scope, id);

        const deregister_season = new MSC_Lambda(this, `${id}-DeregisterSeason`, {
            code: "admin/deregistration/deregister_season",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex"
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [`${props.club_member_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            timeout: 600,
            layers: [props.layers.jwt_layer]
        });
        props.club_history_bucket.grantPut(deregister_season);

        const deregister_members = new MSC_Lambda(this, `${id}-DeregisterMembers`, {
            code: "admin/deregistration/deregister_members",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                CLUB_REPORTING_TABLE_NAME: props.club_reporting_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.club_reporting_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            timeout: 360,
            layers: [props.layers.jwt_layer]
        });
        props.club_history_bucket.grantPut(deregister_members);

        const deregistration_resource = props.api_gateway.root.addResource("deregistration");

        const deregister_season_resource = deregistration_resource.addResource("season");
        const deregister_members_resource = deregistration_resource.addResource("members");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(deregister_season_resource, deregister_season, methodOptions);
        addCorsEnabledMethod(deregister_members_resource, deregister_members, methodOptions);
    }
}
