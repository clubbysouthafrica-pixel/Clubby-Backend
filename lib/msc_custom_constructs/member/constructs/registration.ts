import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberRegistrationConstructProps {
    api_gateway: MSC_APIGateway;
    registration_form_table: MSC_Table;
    club_member_table: MSC_Table;
    users_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
}

export class MSC_MemberRegistrationConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberRegistrationConstructProps) {
        super(scope, id);

        const get_form = new MSC_Lambda(this, `${id}-GetForm`, {
            code: "member/registration/get_form",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ]
            }
        });

        const submit_registration = new MSC_Lambda(this, `${id}-SubmitRegistration`, {
            code: "member/registration/submit_registration",
            envVariables: {
                REGISTRATION_FORM_TABLE_NAME: props.registration_form_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName
            },
            permissions: {
                [props.registration_form_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const registration_resource = props.api_gateway.root.addResource("registration");

        const get_form_resource = registration_resource.addResource("getForm");
        const submit_registration_resource = registration_resource.addResource("submitRegistration");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_form_resource, get_form, methodOptions);
        addCorsEnabledMethod(submit_registration_resource, submit_registration, methodOptions);
    }
}
