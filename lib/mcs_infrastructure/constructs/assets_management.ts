import { Construct } from "constructs";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Distribution, IOriginAccessIdentity, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";

interface MSC_InternalInfraAssetsManagementConstructProps {
    bucket: IBucket;
    shop_images_bucket: IBucket;
    registration_images_bucket: IBucket;
    cert_arn: string;
    assets_subdomain: string;
    shop_images_subdomain: string;
    registration_images_subdomain: string;
    assets_oai: IOriginAccessIdentity;
    shop_images_oai: IOriginAccessIdentity;
    registration_images_oai: IOriginAccessIdentity;
}

export class MSC_InternalInfraAssetsManagementConstruct extends Construct {
    public readonly bucket: IBucket;
    public readonly distribution: Distribution;
    public readonly shop_images_bucket: IBucket;
    public readonly shop_images_distribution: Distribution;
    public readonly registration_images_bucket: IBucket;
    public readonly registration_images_distribution: Distribution;

    constructor(scope: Construct, id: string, props: MSC_InternalInfraAssetsManagementConstructProps) {
        super(scope, id);

        this.bucket = props.bucket ?? new Bucket(this, "AssetsBucket", {});
        this.shop_images_bucket = props.shop_images_bucket ?? new Bucket(this, "ShopImagesBucket", {});
        this.registration_images_bucket = props.registration_images_bucket ?? new Bucket(this, "RegistrationImagesBucket", {});

        const domain = props.assets_subdomain.split(".").slice(1).join(".");

        const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
            domainName: domain
        });

        const certificate = Certificate.fromCertificateArn(this, "AssetsCertificate", props.cert_arn);

        const assetsSubdomain = props.assets_subdomain;
        const shopImagesSubdomain = props.shop_images_subdomain;
        const registrationImagesSubdomain = props.registration_images_subdomain;

        // Assets bucket — distribution + Route53
        this.distribution = new Distribution(this, "AssetsDistribution", {
            defaultBehavior: {
                origin: new S3Origin(this.bucket, { originAccessIdentity: props.assets_oai }),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            domainNames: [assetsSubdomain],
            certificate,
        });

        new ARecord(this, "AssetsSubdomainRecord", {
            zone: hostedZone,
            recordName: assetsSubdomain,
            target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
        });

        // Shop images bucket — distribution + Route53
        this.shop_images_distribution = new Distribution(this, "ShopImagesDistribution", {
            defaultBehavior: {
                origin: new S3Origin(this.shop_images_bucket, { originAccessIdentity: props.shop_images_oai }),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            domainNames: [shopImagesSubdomain],
            certificate,
        });

        new ARecord(this, "ShopImagesSubdomainRecord", {
            zone: hostedZone,
            recordName: shopImagesSubdomain,
            target: RecordTarget.fromAlias(new CloudFrontTarget(this.shop_images_distribution)),
        });

        // Registration images bucket — distribution + Route53
        this.registration_images_distribution = new Distribution(this, "RegistrationImagesDistribution", {
            defaultBehavior: {
                origin: new S3Origin(this.registration_images_bucket, { originAccessIdentity: props.registration_images_oai }),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            domainNames: [registrationImagesSubdomain],
            certificate,
        });

        new ARecord(this, "RegistrationImagesSubdomainRecord", {
            zone: hostedZone,
            recordName: registrationImagesSubdomain,
            target: RecordTarget.fromAlias(new CloudFrontTarget(this.registration_images_distribution)),
        });
    }
}
