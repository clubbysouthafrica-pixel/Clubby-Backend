import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer, MSC_Kms } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberUserProps {
    api_gateway: MSC_APIGateway;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    users_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    kms_key: MSC_Kms;
}

export class MSC_MemberUserConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberUserProps) {
        super(scope, id);

        const get_member_user = new MSC_Lambda(this, `${id}-GetMemberUser`, {
            code: "admin/member_user/get_member_user",
            envVariables: {
                USERS_TABLE_NAME: props.users_table.tableName as string,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.kms_key.keyArn]: [
                    "kms:Decrypt"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const member_user_resource = props.api_gateway.root.addResource("member");

        const get_member_user_resource = member_user_resource.addResource("getUser");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_member_user_resource, get_member_user, methodOptions, undefined, "GET");
    }
}
