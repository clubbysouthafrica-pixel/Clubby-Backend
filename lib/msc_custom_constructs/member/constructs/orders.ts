import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberOrdersConstructProps {
    api_gateway: MSC_APIGateway;
    orders_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    transactions_table: MSC_Table;
    product_table: MSC_Table;
    users_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_MemberOrdersConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberOrdersConstructProps) {
        super(scope, id);

        const cancel_order = new MSC_Lambda(this, `${id}-CancelOrder`, {
            code: "member/orders/cancel_order",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: ["dynamodb:DeleteItem"],
                [props.transactions_table.tableArn]: ["dynamodb:DeleteItem"]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_member_orders = new MSC_Lambda(this, `${id}-GetMemberOrders`, {
            code: "member/orders/get_member_orders",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                ORDERS_INDEX_NAME: "UserIDIndex"
            },
            permissions: {
                [`${props.orders_table.tableArn}/index/UserIDIndex`]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const create_orders = new MSC_Lambda(this, `${id}-CreateOrders`, {
            code: "member/orders/create_orders",
            envVariables: {
                ORDER_TABLE_NAME: props.orders_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const orders_resource = props.api_gateway.root.addResource("orders");

        const get_member_orders_resource = orders_resource.addResource("getMemberOrders");
        const create_orders_resource = orders_resource.addResource("createOrder");
        const cancel_order_resource = orders_resource.addResource("cancelOrder");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_member_orders_resource, get_member_orders, methodOptions, undefined, "GET");
        addCorsEnabledMethod(create_orders_resource, create_orders, methodOptions, undefined, "POST");
        addCorsEnabledMethod(cancel_order_resource, cancel_order, methodOptions, undefined, "POST");
    }
}
