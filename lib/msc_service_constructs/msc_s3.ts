import { RemovalPolicy } from "aws-cdk-lib";
import { Bucket, BucketEncryption, HttpMethods } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface MSC_BucketProps {
  bucket_name: string;
  enableCors?: boolean;
}

export class MSC_Bucket extends Bucket {
  constructor(scope: Construct, id: string, props: MSC_BucketProps) {
    super(scope, `${id}-Bucket`, {
      bucketName: props.bucket_name,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      cors: props.enableCors ? [
        {
          allowedMethods: [
            HttpMethods.GET,
            HttpMethods.PUT
          ],
          allowedOrigins: ["https://beta.clubby.co.za"],
          allowedHeaders: ["*"],
          maxAge: 3600
        },
      ] : undefined,
      autoDeleteObjects: true
    })
  }
}
