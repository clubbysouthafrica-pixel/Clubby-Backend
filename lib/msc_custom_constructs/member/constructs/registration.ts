import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberRegistrationConstructProps {
    api_gateway: MSC_APIGateway;
    registration_form_table: MSC_Table;
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

        const registration_resource = props.api_gateway.root.addResource("registration");

        const get_form_resource = registration_resource.addResource("getForm");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_form_resource, get_form, methodOptions);
    }
}
