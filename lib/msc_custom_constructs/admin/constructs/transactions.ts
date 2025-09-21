import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";
import { MSC_Layers } from "../../lambda_layers";

interface MSC_TransactionsConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    transactions_table: MSC_Table;
    layers: MSC_Layers;
}

export class MSC_TransactionsConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_TransactionsConstructProps) {
        super(scope, id);

        const get_member_transactions = new MSC_Lambda(this, `${id}-GetMemberTransaction`, {
            code: "admin/transactions/get_member_transaction",
            envVariables: {
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                REGISTRATIONS_USER_ID_INDEX: "UserIDIndex"
            },
            permissions: {
                [`${props.transactions_table.tableArn}/index/UserIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const transactions = props.api_gateway.root.addResource("transactions");

        const get_member_transactions_resource = transactions.addResource("member");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_member_transactions_resource, get_member_transactions, methodOptions, undefined, "GET");
    }
}
