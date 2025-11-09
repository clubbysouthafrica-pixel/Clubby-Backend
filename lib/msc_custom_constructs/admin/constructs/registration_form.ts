import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_AdminRegistrationFormConstructProps {
    api_gateway: MSC_APIGateway;
    registration_form_table: MSC_Table;
    club_table: MSC_Table;
    registrations_table: MSC_Table;
    club_member_table: MSC_Table;
    club_admin_table: MSC_Table;
    signatures_bucket: MSC_Bucket;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
}

export class MSC_AdminRegistrationFormConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminRegistrationFormConstructProps) {
        super(scope, id);

        const create_registration_form = new MSC_Lambda(this, `${id}-CreateRegistrationForm`, {
            code: "admin/registration/create_registration_form",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_ADMIN_TABLE_NAME: props.club_admin_table.tableName
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_admin_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_member_registration = new MSC_Lambda(this, `${id}-GetMemberRegistration`, {
            code: "admin/registration/get_member_registration",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
            },
            permissions: {
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.signatures_bucket.grantRead(get_member_registration);

        const get_form = new MSC_Lambda(this, `${id}-GetForm`, {
            code: "admin/registration/get_form",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const registration_resource = props.api_gateway.root.addResource("registration");

        const create_registration_form_resource = registration_resource.addResource("createRegistrationForm");
        const get_form_resource = registration_resource.addResource("getForm");
        const get_member_registration_resource = registration_resource.addResource("getMemberRegistration")

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(create_registration_form_resource, create_registration_form, methodOptions);
        addCorsEnabledMethod(get_form_resource, get_form, methodOptions, undefined, "GET");
        addCorsEnabledMethod(get_member_registration_resource, get_member_registration, methodOptions, undefined, "GET");
    }
}
