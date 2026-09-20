import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminRegistrationConfigurationConstructProps {
    api_gateway: MSC_APIGateway;
    registration_configuration_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_AdminRegistrationConfigurationConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminRegistrationConfigurationConstructProps) {
        super(scope, id);

        const update_registration_configuration = new MSC_Lambda(this, `${id}-UpdateRegConfiguration`, {
            code: "admin/registration_configuration/update_registration_configuration",
            envVariables: {
                REGISTRATION_CONFIGURATION_TABLE_NAME: props.registration_configuration_table.tableName,
            },
            permissions: {
                [props.registration_configuration_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_registration_configuration = new MSC_Lambda(this, `${id}-GetRegConfiguration`, {
            code: "admin/registration_configuration/get_registration_configuration",
            envVariables: {
                REGISTRATION_CONFIGURATION_TABLE_NAME: props.registration_configuration_table.tableName,
            },
            permissions: {
                [props.registration_configuration_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const registration_configuration_resource = props.api_gateway.root.addResource("registrationConfiguration");
        const update_registration_configuration_resource = registration_configuration_resource.addResource("updateRegistrationConfiguration");

        const get_registration_configuration_resource = registration_configuration_resource.addResource("getRegistrationConfiguration");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        };

        addCorsEnabledMethod(update_registration_configuration_resource, update_registration_configuration, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_registration_configuration_resource, get_registration_configuration, methodOptions, undefined, "GET");
    }
}
