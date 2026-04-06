import { Construct } from "constructs";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Distribution, OriginAccessIdentity, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { EndpointType } from "aws-cdk-lib/aws-apigateway";

interface MSC_InternalInfraAssetsManagementConstructProps {
    bucket: IBucket;
}

export class MSC_InternalInfraAssetsManagementConstruct extends Construct {
    public readonly bucket: IBucket;
    public readonly distribution: Distribution;

    constructor(scope: Construct, id: string, props: MSC_InternalInfraAssetsManagementConstructProps) {
        super(scope, id);

        // Use existing bucket or create new
        this.bucket = props.bucket ?? new Bucket(this, "AssetsBucket", {});

        // CloudFront OAI for S3 access
        const oai = new OriginAccessIdentity(this, "AssetsOAI");
        this.bucket.grantRead(oai);

        // CloudFront distribution (modern)
        this.distribution = new Distribution(this, "AssetsDistribution", {
            defaultBehavior: {
                origin: new S3Origin(this.bucket, { originAccessIdentity: oai }),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
        });

        const hosted_zone_domain = process.env.DOMAIN as string;

        const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
            domainName: hosted_zone_domain
        });

        // Route53 record for subdomain
        new ARecord(this, "AssetsSubdomainRecord", {
            zone: hostedZone,
            recordName: `${process.env.DEPLOYER}-assets`, // just the subdomain part, e.g. 'assets' if zone is 'example.com'
            target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
        });
    }
}
