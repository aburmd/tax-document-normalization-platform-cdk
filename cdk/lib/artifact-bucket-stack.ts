import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface ArtifactBucketStackProps extends cdk.StackProps {
  environment: string;
}

export class ArtifactBucketStack extends cdk.Stack {
  public readonly bucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: ArtifactBucketStackProps) {
    super(scope, id, props);

    const env = props.environment;

    this.bucket = new s3.Bucket(this, "ArtifactBucket", {
      bucketName: `tax-doc-artifacts-${env}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, "ArtifactBucketName", {
      value: this.bucket.bucketName,
    });
  }
}
