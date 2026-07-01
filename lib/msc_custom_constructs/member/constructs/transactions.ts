import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_TransactionsConstructProps {
    api_gateway: MSC_APIGateway;
    token_authorizer: TokenAuthorizer;
    transactions_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_TransactionsConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_TransactionsConstructProps) {
        super(scope, id);

        const get_user_transactions = new MSC_Lambda(this, `${id}-GetUserTransaction`, {
            code: "member/transactions/get_user_transaction",
            envVariables: {
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                TRANSACTIONS_USER_ID_INDEX: "UserIDIndex"
            },
            permissions: {
                [`${props.transactions_table.tableArn}/index/UserIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_transaction_status = new MSC_Lambda(this, `${id}-GetTransactionStatus`, {
            code: "member/transactions/get_transaction_status",
            envVariables: {
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
            },
            permissions: {
                [props.transactions_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const transactions = props.api_gateway.root.addResource("transactions");

        const get_user_transactions_resource = transactions.addResource("user");
        const get_transaction_status_resource = transactions.addResource("status");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        const publicMethodOptions: MethodOptions = {
            methodResponses: [],
        }

        addCorsEnabledMethod(get_user_transactions_resource, get_user_transactions, methodOptions, undefined, "GET");
        addCorsEnabledMethod(get_transaction_status_resource, get_transaction_status, publicMethodOptions, undefined, "GET");
    }
}
