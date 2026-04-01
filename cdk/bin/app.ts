#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ArtifactBucketStack } from "../lib/artifact-bucket-stack";
import { TaxDocIngestionStack } from "../lib/tax-doc-ingestion-stack";
import { TaxDocAthenaStack } from "../lib/tax-doc-athena-stack";

const app = new cdk.App();
const env = app.node.tryGetContext("env") || "dev";
const lambdaArtifactKey = app.node.tryGetContext("lambdaArtifactKey");

const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || "us-east-1",
};

const dataBucketName = `tax-doc-normalization-${env}`;

// Stack 1: Artifact bucket (deploy first)
const artifactStack = new ArtifactBucketStack(
  app,
  `TaxDocArtifactStack-${env}`,
  { env: awsEnv, environment: env }
);

// Stack 2: Main ingestion stack (depends on artifact bucket)
if (lambdaArtifactKey) {
  const ingestionStack = new TaxDocIngestionStack(
    app,
    `TaxDocIngestionStack-${env}`,
    {
      env: awsEnv,
      environment: env,
      artifactBucket: artifactStack.bucket,
      lambdaArtifactKey,
    }
  );
  ingestionStack.addDependency(artifactStack);
}

// Stack 3: Athena/Glue (depends on data bucket existing)
const athenaStack = new TaxDocAthenaStack(app, `TaxDocAthenaStack-${env}`, {
  env: awsEnv,
  environment: env,
  dataBucketName,
});
