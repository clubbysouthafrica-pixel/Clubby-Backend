import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    image_bucket: MSC_Bucket;
    token_authorizer: TokenAuthorizer;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_AdminClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminClubConstructProps) {
        super(scope, id);

        const get_club = new MSC_Lambda(this, `${id}-GetClub`, {
            code: "admin/club/get_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.image_bucket.grantPut(get_club);
        props.image_bucket.grantRead(get_club);

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

        const get_club_details = new MSC_Lambda(this, `${id}-GetClubDetails`, {
            code: "admin/club/get_club_details",
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

        const club_resource = props.api_gateway.root.addResource("club");

        const get_club_resource = club_resource.addResource("getClub");
        const update_club_details_resource = club_resource.addResource("updateClubDetails");
        const get_club_details_resource = club_resource.addResource("getClubDetails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_resource, get_club, methodOptions, undefined, "GET");
        addCorsEnabledMethod(update_club_details_resource, update_club_details, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_club_details_resource, get_club_details, methodOptions, undefined, "GET");
    }
}
