import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_MemberClubConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    registration_fees_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    image_bucket: MSC_Bucket;
    layers: MSC_Layers;
}

export class MSC_MemberClubConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberClubConstructProps) {
        super(scope, id);

        const get_club = new MSC_Lambda(this, `${id}-GetClub`, {
            code: "member/club/get_club",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName,
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
        props.image_bucket.grantRead(get_club);

        const get_all_clubs = new MSC_Lambda(this, `${id}-GetAllClubs`, {
            code: "member/club/get_all_clubs",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:Scan"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.image_bucket.grantRead(get_all_clubs);

        const get_club_bank_details = new MSC_Lambda(this, `${id}-GetClubBankDetails`, {
            code: "member/club/get_club_bank_details",
            envVariables: {
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registration_fees_table.tableName
            },
            permissions: {
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registration_fees_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const club_resource = props.api_gateway.root.addResource("club");

        const get_club_resource = club_resource.addResource("getClub");
        const get_all_clubs_resource = club_resource.addResource("getAllClubs");
        const get_club_bank_details_resource = club_resource.addResource("getClubBankDetails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_resource, get_club, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(get_all_clubs_resource, get_all_clubs, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(get_club_bank_details_resource, get_club_bank_details, methodOptions, undefined, "GET")
    }
}
