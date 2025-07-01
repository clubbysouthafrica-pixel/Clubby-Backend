import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, LambdaIntegration, MethodOptions, MockIntegration, PassthroughBehavior, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_MemberUserConstructProps {
    api_gateway: MSC_APIGateway;
    users_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: MSC_Layers;
}

export class MSC_MemberUserConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberUserConstructProps) {
        super(scope, id);

        const get_user = new MSC_Lambda(this, `${id}-GetUser`, {
            code: "member/user/get_user",
            envVariables: {
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const onboard_user = new MSC_Lambda(this, `${id}-OnboardUser`, {
            code: "member/user/onboard_user",
            envVariables: {
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_user_details = new MSC_Lambda(this, `${id}-UpdateUserDetails`, {
            code: "member/user/update_user_details",
            envVariables: {
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "ADMIN"
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const user_resource = props.api_gateway.root.addResource("user");

        const get_user_resource = user_resource.addResource("getUser");
        const onboard_user_resource = user_resource.addResource("onboardUser");
        const update_user_details_resource = user_resource.addResource("updateUserDetails");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_user_resource, get_user, methodOptions, undefined, "GET");
        addCorsEnabledMethod(onboard_user_resource, onboard_user, methodOptions, undefined, "PUT");
        addCorsEnabledMethod(update_user_details_resource, update_user_details, methodOptions)
    }
}
