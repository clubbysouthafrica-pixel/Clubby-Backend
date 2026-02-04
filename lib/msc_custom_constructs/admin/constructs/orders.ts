import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminOrdersConstructProps {
    api_gateway: MSC_APIGateway;
    orders_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    transactions_table: MSC_Table;
    product_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
    club_table: MSC_Table;
}

export class MSC_AdminOrdersConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminOrdersConstructProps) {
        super(scope, id);

        const get_club_orders = new MSC_Lambda(this, `${id}-GetClubOrders`, {
            code: "admin/orders/get_club_orders",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const confirm_order_payment = new MSC_Lambda(this, `${id}-ConfirmOrderPayment`, {
            code: "admin/orders/confirm_order_payment",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:UpdateItem",
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_order_fulfillment = new MSC_Lambda(this, `${id}-UpdateOrderFulfillment`, {
            code: "admin/orders/update_order_fulfillment",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const refund_or_remove_order = new MSC_Lambda(this, `${id}-RefundOrRemoveOrder`, {
            code: "admin/orders/refund_or_remove_order",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName,
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.product_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const orders_resource = props.api_gateway.root.addResource("orders");

        const get_club_orders_resource = orders_resource.addResource("getClubOrders");
        const confirm_order_payment_resource = orders_resource.addResource("confirmOrderPayment");
        const update_order_fulfillment_resource = orders_resource.addResource("updateOrderFulfillment");
        const refund_or_remove_order_resource = orders_resource.addResource("refundOrRemove");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_club_orders_resource, get_club_orders, methodOptions, undefined, "GET");
        addCorsEnabledMethod(confirm_order_payment_resource, confirm_order_payment, methodOptions, undefined, "POST");
        addCorsEnabledMethod(update_order_fulfillment_resource, update_order_fulfillment, methodOptions, undefined, "POST");
        addCorsEnabledMethod(refund_or_remove_order_resource, refund_or_remove_order, methodOptions, undefined, "POST");
    }
}
