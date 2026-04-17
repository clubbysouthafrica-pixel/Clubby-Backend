import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer, MSC_Bucket } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_ReportingConstructProps {
    api_gateway: MSC_APIGateway;
    club_table: MSC_Table;
    registration_form_table: MSC_Table;
    registrations_table: MSC_Table;
    transactions_table: MSC_Table;
    billing_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    club_history_bucket: MSC_Bucket;
    orders_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_ReportingConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_ReportingConstructProps) {
        super(scope, id);

        const general_reporting = new MSC_Lambda(this, `${id}-GeneralReporting`, {
            code: "admin/reporting/general_reporting",
            envVariables: {
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
            },
            permissions: {
                [props.transactions_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });

        const registration_fees = new MSC_Lambda(this, `${id}-RegistrationFees`, {
            code: "admin/reporting/registration_fees",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                REGISTRATIONS_CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                REGISTRATIONS_TABLE_NAME: props.registrations_table.tableName,
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName
            },
            permissions: {
                [`${props.registrations_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_history_bucket.bucketArn]: [
                    "s3:ListBucket"
                ],
                [`${props.club_history_bucket.bucketArn}/*`]: [
                    "s3:GetObject"
                ]
            },
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });

        const mcs_billing = new MSC_Lambda(this, `${id}-McsBilling`, {
            code: "admin/reporting/mcs_billing",
            envVariables: {
                MONTHLY_BILLING_TABLE_NAME: props.billing_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_ACCOUNT_ID_INDEX: "ClubAccountIDIndex",
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName
            },
            permissions: {
                [`${props.billing_table.tableArn}/index/ClubAccountIDIndex`]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_history_bucket.bucketArn]: [
                    "s3:ListBucket"
                ],
                [`${props.club_history_bucket.bucketArn}/*`]: [
                    "s3:GetObject"
                ]
            },
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });

        const shop_reporting = new MSC_Lambda(this, `${id}-ShopReporting`, {
            code: "admin/reporting/shop_reporting",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                CLUB_HISTORY_BUCKET_NAME: props.club_history_bucket.bucketName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_history_bucket.bucketArn]: [
                    "s3:ListBucket"
                ],
                [`${props.club_history_bucket.bucketArn}/*`]: [
                    "s3:GetObject"
                ]
            },
            memory: 2048,
            layers: [props.layers.jwt_layer]
        });

        const reporting_resource = props.api_gateway.root.addResource("reporting");

        const general_reporting_resource = reporting_resource.addResource("generalReporting");
        const registration_fees_resource = reporting_resource.addResource("registrationBilling")
        const mcs_billing_resource = reporting_resource.addResource("mcsBilling");
        const shop_reporting_resource = reporting_resource.addResource("shopReporting");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(general_reporting_resource, general_reporting, methodOptions, undefined, "GET");
        addCorsEnabledMethod(registration_fees_resource, registration_fees, methodOptions, undefined, "GET");
        addCorsEnabledMethod(mcs_billing_resource, mcs_billing, methodOptions, undefined, "GET");
        addCorsEnabledMethod(shop_reporting_resource, shop_reporting, methodOptions, undefined, "GET");
    }
}
