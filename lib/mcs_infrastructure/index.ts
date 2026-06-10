import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { IOriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';
import {
    MSC_InternalInfraAssetsManagementConstruct
} from "./constructs";

export interface MSC_InfraStackProps extends StackProps {
    assets_bucket_name: string;
    shop_images_bucket_name: string;
    cert_arn: string;
    assets_subdomain: string;
    shop_images_subdomain: string;
    assets_oai: IOriginAccessIdentity;
    shop_images_oai: IOriginAccessIdentity;
}

export class MSC_InfraStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_InfraStackProps) {
        super(scope, id, props);

        const assets_bucket = Bucket.fromBucketName(this, `${id}-AssetsBucketImported`, props.assets_bucket_name);
        const shop_images_bucket = Bucket.fromBucketName(this, `${id}-ShopImagesBucketImported`, props.shop_images_bucket_name);

        new MSC_InternalInfraAssetsManagementConstruct(this, `${id}-AssetsManagement`, {
            bucket: assets_bucket,
            shop_images_bucket,
            cert_arn: props.cert_arn,
            assets_subdomain: props.assets_subdomain,
            shop_images_subdomain: props.shop_images_subdomain,
            assets_oai: props.assets_oai,
            shop_images_oai: props.shop_images_oai,
        });
    }
}