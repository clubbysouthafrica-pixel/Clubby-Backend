import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

interface MSC_KmsProps {
    enableKeyRotation?: boolean;
    description?: string;
}

export class MSC_Kms extends kms.Key {
    readonly key: kms.Key;
    readonly alias: kms.Alias;

    constructor(scope: Construct, id: string, props?: MSC_KmsProps) {
        const key = new kms.Key(scope, id, {
            enableKeyRotation: props?.enableKeyRotation ?? true,
            description: props?.description ?? 'KMS key for encrypting MyClubSoftware data',
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        super(scope, `${id}-Key`, {
            enableKeyRotation: props?.enableKeyRotation ?? true,
            description: props?.description ?? 'KMS key for encrypting MyClubSoftware data',
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

        this.key = key;

        this.alias = new kms.Alias(scope, `${id}-Alias`, {
            aliasName: process.env.ENVIRONMENT !== 'Dev' 
                ? `alias/${process.env.ENVIRONMENT ?? 'myclubsoftware'}-${id.toLowerCase()}`
                : `alias/dev-${id.toLowerCase()}`,
            targetKey: this,
        });
    }
}
