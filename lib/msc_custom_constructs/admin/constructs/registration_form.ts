import { Construct } from "constructs";
import { MSC_Cognito, MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminRegistrationFormConstructProps {
    api_gateway: MSC_APIGateway;
    registration_form_table: MSC_Table;
    club_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_AdminRegistrationFormConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminRegistrationFormConstructProps) {
        super(scope, id);

        const add_registration_fields = new MSC_Lambda(this, `${id}-AddFields`, {
            code: "admin/registration/add_registration_fields",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const get_form = new MSC_Lambda(this, `${id}-GetForm`, {
            code: "admin/registration/get_form",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ]
            }
        });

        const registration_resource = props.api_gateway.root.addResource("registration");

        const add_registration_fields_resource = registration_resource.addResource("addRegistrationFields");
        const get_form_resource = registration_resource.addResource("getForm");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(add_registration_fields_resource, add_registration_fields, methodOptions);
        addCorsEnabledMethod(get_form_resource, get_form, methodOptions, undefined, "GET");
    }
}
