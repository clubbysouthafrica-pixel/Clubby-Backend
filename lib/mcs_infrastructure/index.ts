import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
    MSC_InternalInfraAssetsManagementConstruct
} from "./constructs";

export interface MSC_InfraStackProps extends StackProps {
    assets_bucket_name: string;
}

export class MSC_InfraStack extends Stack {
    constructor(scope: Construct, id: string, props: MSC_InfraStackProps) {
        super(scope, id, props);

        const assets_bucket = Bucket.fromBucketName(this, `${id}-AssetsBucketImported`, props.assets_bucket_name);

        new MSC_InternalInfraAssetsManagementConstruct(this, `${id}-AssetsManagement`, {
            bucket: assets_bucket,
        });

    }
}