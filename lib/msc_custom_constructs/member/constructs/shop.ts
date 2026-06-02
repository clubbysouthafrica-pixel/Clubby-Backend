import { Construct } from "constructs";
import { MSC_Lambda, MSC_APIGateway, MSC_Table, MSC_Bucket, MSC_LambdaLayer } from "../../../msc_service_constructs";
import { addCorsEnabledMethod } from "../../../msc_custom_functions";
import { AuthorizationType, MethodOptions, TokenAuthorizer } from "aws-cdk-lib/aws-apigateway";

interface MSC_MemberShopConstructProps {
    api_gateway: MSC_APIGateway;
    product_table: MSC_Table;
    club_table: MSC_Table;
    club_member_table: MSC_Table;
    token_authorizer: TokenAuthorizer;
    shop_images_bucket: MSC_Bucket;
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
                PRODUCT_TABLE_NAME: props.product_table.tableName,
                SHOP_IMAGES_BUCKET_NAME: props.shop_images_bucket.bucketName,
                CLUB_TABLE_NAME: props.club_table.tableName,
                CLUB_MEMBER_TABLE_NAME: props.club_member_table.tableName
            },
            permissions: {
                [props.product_table.tableArn]: [
                    "dynamodb:Query"
                ],
                [props.club_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.club_member_table.tableArn]: [
                    "dynamodb:GetItem"
                ],
                [props.shop_images_bucket.bucketArn]: [
                    "s3:GetObject",
                    "s3:HeadObject"
                ],
                [`${props.shop_images_bucket.bucketArn}/*`]: [
                    "s3:GetObject",
                    "s3:HeadObject"
                ]
            },
            layers: [props.layers.jwt_layer]
        });

        const shop_resource = props.api_gateway.root.addResource("shop");

        const get_products_resource = shop_resource.addResource("getClubProducts");

        addCorsEnabledMethod(get_products_resource, get_club_products, { methodResponses: [] }, undefined, "GET");
    }
}
