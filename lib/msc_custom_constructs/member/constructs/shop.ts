import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberShopConstructProps {
    api_gateway: MSC_APIGateway;
    product_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_MemberShopConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_MemberShopConstructProps) {
        super(scope, id);

        const get_club_products = new MSC_Lambda(this, `${id}-GetClubProducts`, {
            code: "member/shop/get_club_products",
            envVariables: {
                PRODUCT_TABLE_NAME: props.product_table.tableName
            },
            permissions: {
                [props.product_table.tableArn]: [
                    "dynamodb:Query"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const shop_resource = props.api_gateway.root.addResource("shop");

        const get_products_resource = shop_resource.addResource("getClubProducts");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(get_products_resource, get_club_products, methodOptions, undefined, "GET");
    }
}
