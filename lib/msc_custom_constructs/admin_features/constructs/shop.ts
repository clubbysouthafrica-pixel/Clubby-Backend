import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_AdminShopConstructProps {
    api_gateway: MSC_APIGateway;
    product_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    shop_images_bucket: MSC_Bucket;
    club_table: MSC_Table;
    layers: {
        jwt_layer: MSC_LambdaLayer;
    };
}

export class MSC_AdminShopConstruct extends Construct {
    constructor(scope: Construct, id: string, props: MSC_AdminShopConstructProps) {
        super(scope, id);

        const add_product = new MSC_Lambda(this, `${id}-AddProduct`, {
            code: "admin_features/shop/add_product",
            envVariables: {
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                SHOP_IMAGES_BUCKET_NAME: props.shop_images_bucket.bucketName
            },
            permissions: {
                [props.product_table.tableArn]: [
                    "dynamodb:PutItem"
                ],
                [props.shop_images_bucket.bucketArn]: [
                    "s3:PutObject"
                ],
                [`${props.shop_images_bucket.bucketArn}/*`]: [
                    "s3:PutObject"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const get_club_products = new MSC_Lambda(this, `${id}-GetClubProducts`, {
            code: "admin_features/shop/get_club_products",
            envVariables: {
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                SHOP_IMAGES_CDN_URL: `https://${process.env.DEPLOYER ? `${process.env.DEPLOYER}-` : ""}shop-images.${process.env.DOMAIN}`,
                CLUB_TABLE_NAME: props.club_table.tableName
            },
            permissions: {
                [props.product_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const update_product = new MSC_Lambda(this, `${id}-UpdateProduct`, {
            code: "admin_features/shop/update_product",
            envVariables: {
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                SHOP_IMAGES_BUCKET_NAME: props.shop_images_bucket.bucketName
            },
            permissions: {
                [props.product_table.tableArn]: [
                    "dynamodb:UpdateItem"
                ],
                [props.shop_images_bucket.bucketArn]: [
                    "s3:PutObject"
                ],
                [`${props.shop_images_bucket.bucketArn}/*`]: [
                    "s3:PutObject"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const shop_resource = props.api_gateway.root.addResource("shop");

        const add_product_resource = shop_resource.addResource("addProduct");
        const get_products_resource = shop_resource.addResource("getClubProducts");
        const update_product_resource = shop_resource.addResource("updateProduct");

        const methodOptions: MethodOptions = {
            methodResponses: [],
            authorizationType: AuthorizationType.CUSTOM,
            authorizer: props.token_authorizer
        }

        addCorsEnabledMethod(add_product_resource, add_product, methodOptions, undefined, "POST");
        addCorsEnabledMethod(get_products_resource, get_club_products, methodOptions, undefined, "GET");
        addCorsEnabledMethod(update_product_resource, update_product, methodOptions, undefined, "POST");
    }
}
