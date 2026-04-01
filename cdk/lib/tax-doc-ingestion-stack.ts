import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

interface TaxDocIngestionStackProps extends cdk.StackProps {
  environment: string;
  artifactBucket: s3.IBucket;
  lambdaArtifactKey: string;
}

export class TaxDocIngestionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TaxDocIngestionStackProps) {
    super(scope, id, props);

    const env = props.environment;

    // S3 Bucket — document storage
    const bucket = new s3.Bucket(this, "TaxDocBucket", {
      bucketName: `tax-doc-normalization-${env}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

    // DLQ
    const dlq = new sqs.Queue(this, "IngestionDLQ", {
      queueName: `tax-doc-ingestion-dlq-${env}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    // CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, "IngestionLogGroup", {
      logGroupName: `/aws/lambda/tax-doc-pdf-ingestion-${env}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda — code from S3 artifact
    const ingestionFn = new lambda.Function(this, "PdfIngestionFn", {
      functionName: `tax-doc-pdf-ingestion-${env}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.lambda_handler",
      code: lambda.Code.fromBucket(
        props.artifactBucket,
        props.lambdaArtifactKey
      ),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      logGroup,
      deadLetterQueue: dlq,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        RAW_PREFIX: "raw/",
        CLEANSED_PREFIX: "cleansed/",
        REJECTED_PREFIX: "rejected/",
        AUDIT_PREFIX: "audit/",
        CONFIG_PREFIX: "config/",
        ENV: env,
      },
    });

    // IAM — least privilege
    bucket.grantRead(ingestionFn, "raw/*");
    bucket.grantPut(ingestionFn, "cleansed/*");
    bucket.grantPut(ingestionFn, "rejected/*");
    bucket.grantPut(ingestionFn, "audit/*");
    bucket.grantRead(ingestionFn, "config/*");

    // S3 event notification → Lambda on raw/*.pdf
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ingestionFn),
      { prefix: "raw/", suffix: ".pdf" }
    );

    // Outputs
    new cdk.CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: ingestionFn.functionName,
    });
    new cdk.CfnOutput(this, "DLQUrl", { value: dlq.queueUrl });
  }
}
