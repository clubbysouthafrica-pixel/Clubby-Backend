import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer, MSC_Kms } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberRegistrationFormConstructProps {
    api_gateway: MSC_APIGateway;
    registration_form_table: MSC_Table;
    club_member_table: MSC_Table;
    registrations_table: MSC_Table;
    club_table: MSC_Table;
    signatures_bucket: MSC_Bucket;
    token_authorizer: TokenAuthorizer;
    image_bucket: MSC_Bucket;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    kms_key: MSC_Kms;
}

export class MSC_MemberRegistrationFormConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberRegistrationFormConstructProps) {
        super(scope, id);

        const get_form = new MSC_Lambda(this, `${id}-GetForm`, {
            code: "member/registration/get_form",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                IMAGE_BUCKET_NAME: props.image_bucket.bucketName,
                KMS_KEY_ID: props.kms_key.keyId
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.registrations_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Decrypt"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.signatures_bucket.grantRead(get_form);
        props.image_bucket.grantRead(get_form);

        const get_member_registration = new MSC_Lambda(this, `${id}-GetMemberRegistration`, {
            code: "member/registration/get_member_registration",
            envVariables: {
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                SIGNATURES_BUCKET_NAME: props.signatures_bucket.bucketName,
                KMS_KEY_ID: props.kms_key.keyId,
                CLUB_TABLE_NAME: props.club_table.tableName,
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
                ],
                [props.kms_key.keyArn]: [
                    "kms:Decrypt"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });
        props.signatures_bucket.grantRead(get_member_registration);

        const get_registration_field = new MSC_Lambda(this, `${id}-GetRegistrationField`, {
            code: "member/registration/get_registration_field",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_registration_field = new MSC_Lambda(this, `${id}-UpdateRegistrationField`, {
            code: "member/registration/update_registration_field",
            envVariables: {
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                KMS_KEY_ID: props.kms_key.keyId
            },
            permissions: {
                [props.registrations_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Encrypt",
                    "kms:GenerateDataKey"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const registration_resource = props.api_gateway.root.addResource("registration");

        const get_form_resource = registration_resource.addResource("getForm");
        const get_member_registration_resource = registration_resource.addResource("getMemberRegistration")
        const get_registration_field_resource = registration_resource.addResource("getRegistrationField");
        const update_registration_field_resource = registration_resource.addResource("updateRegistrationField");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_form_resource, get_form, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(get_member_registration_resource, get_member_registration, { methodResponses: [] }, undefined, "GET");
        addCorsEnabledMethod(get_registration_field_resource, get_registration_field, methodOptions, undefined, "GET");
        addCorsEnabledMethod(update_registration_field_resource, update_registration_field, methodOptions);
    }
}
