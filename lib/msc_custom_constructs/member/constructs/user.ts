import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { MethodOptions } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberUserConstructProps {
    api_gateway: MSC_APIGateway;
    users_table: MSC_Table;
}

export class MSC_MemberUserConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberUserConstructProps) {
        super(scope, id);

        const get_user = new MSC_Lambda(this, `${id}-GetUser`, {
            code: "admin/user/get_user",
            envVariables: {
                USERS_TABLE_NAME: props.users_table.tableName,
                USER_TYPE: "MEMBER"
            },
            permissions: {
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            }
        });

        const user_resource = props.api_gateway.root.addResource("user");

        const get_user_resource = user_resource.addResource("getUser");

        const methodOptions: MethodOptions = {
            methodResponses: [],
        }

        addCorsEnabledMethod(get_user_resource, get_user, methodOptions);
    }
}
