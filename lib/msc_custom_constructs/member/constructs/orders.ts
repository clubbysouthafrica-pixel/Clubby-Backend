import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer, MSC_Cognito } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberOrdersConstructProps {
    api_gateway: MSC_APIGateway;
    orders_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    transactions_table: MSC_Table;
    product_table: MSC_Table;
    users_table: MSC_Table;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    member_user_pool: MSC_Cognito;
    layers: {
        jwt_layer: MSC_LambdaLayer;
        qrcode_layer: MSC_LambdaLayer;
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
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                DOMAIN: process.env.DOMAIN as string
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.product_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendRawEmail"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.qrcode_layer]
        });

        const public_create_orders = new MSC_Lambda(this, `${id}-PublicCreateOrders`, {
            code: "member/orders/public_create_orders",
            envVariables: {
                ORDER_TABLE_NAME: props.orders_table.tableName,
                USERS_TABLE_NAME: props.users_table.tableName,
                TRANSACTIONS_TABLE_NAME: props.transactions_table.tableName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName,
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                USER_POOL_ID: props.member_user_pool.userPoolId,
                USER_TYPE: "MEMBER",
                DOMAIN: process.env.DOMAIN as string
            },
            permissions: {
                [props.orders_table.tableArn]: [
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                [props.users_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                [props.transactions_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                [props.product_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.member_user_pool.userPoolArn]: [
                    "cognito-idp:AdminCreateUser",
                    "cognito-idp:AdminSetUserPassword",
                    "cognito-idp:AdminGetUser"
                ],
                [`arn:aws:ses:${process.env.REGION}:${process.env.ACCOUNT}:identity/*`]: [
                    "ses:SendEmail",
                    "ses:SendRawEmail"
                ]
            },
            layers: [props.layers.jwt_layer, props.layers.qrcode_layer]
        });

        const get_public_order = new MSC_Lambda(this, `${id}-GetPublicOrder`, {
            code: "member/orders/get_public_order",
            envVariables: {
                ORDERS_TABLE_NAME: props.orders_table.tableName
            },
            permissions: {
                [props.orders_table.tableArn]: ["dynamodb:GetItem"]
            },
            layers: [props.layers.jwt_layer]
        });

        const orders_resource = props.api_gateway.root.addResource("orders");

        const get_member_orders_resource = orders_resource.addResource("getMemberOrders");
        const create_orders_resource = orders_resource.addResource("createOrder");
        const public_create_orders_resource = orders_resource.addResource("publicCreateOrder");
        const cancel_order_resource = orders_resource.addResource("cancelOrder");
        const get_public_order_resource = orders_resource.addResource("getPublicOrder");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_member_orders_resource, get_member_orders, methodOptions, undefined, "GET");
        addCorsEnabledMethod(create_orders_resource, create_orders, methodOptions, undefined, "POST");
        addCorsEnabledMethod(public_create_orders_resource, public_create_orders, { methodResponses: [] }, undefined, "POST");
        addCorsEnabledMethod(cancel_order_resource, cancel_order, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_public_order_resource, get_public_order, { methodResponses: [] }, undefined, "GET");
    }
}
