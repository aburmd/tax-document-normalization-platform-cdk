# tax-document-normalization-platform-cdk

AWS CDK infrastructure for the Tax Document Normalization Platform.

## Stacks

| Stack | Resources | Deploy Order |
|-------|-----------|-------------|
| `TaxDocArtifactStack-{env}` | S3 artifact bucket for Lambda zips | 1st |
| `TaxDocIngestionStack-{env}` | S3 doc bucket, Lambda, SQS DLQ, CloudWatch, S3 event trigger | 2nd |

## Prerequisites

- Node.js 18+
- AWS CLI configured (`aws configure` — default profile, us-east-1)
- AWS CDK CLI (`npm install -g aws-cdk`)

## Setup

```bash
cd cdk
npm install
```

## Deploy Workflow

### Step 1: Deploy artifact bucket
```bash
cd cdk
cdk bootstrap
cdk deploy TaxDocArtifactStack-dev -c env=dev
```

### Step 2: Build and upload Lambda zip (in the app repo)
```bash
cd ~/gitworkspace/tax-document-normalization-platform
./scripts/package.sh
./scripts/upload-artifact.sh dev
```
This outputs the artifact key (e.g., `lambda/pdf-ingestion-abc1234.zip`).

### Step 3: Deploy main stack with artifact key
```bash
cd ~/gitworkspace/tax-document-normalization-platform-cdk/cdk
cdk deploy TaxDocIngestionStack-dev -c env=dev -c lambdaArtifactKey=lambda/pdf-ingestion-abc1234.zip
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `cdk synth -c env=dev` | Synthesize CloudFormation template |
| `cdk diff -c env=dev -c lambdaArtifactKey=...` | Compare deployed vs current |
| `cdk destroy TaxDocIngestionStack-dev -c env=dev` | Tear down ingestion stack |
| `cdk destroy TaxDocArtifactStack-dev -c env=dev` | Tear down artifact bucket |

## Architecture

- **Artifact Bucket**: `tax-doc-artifacts-dev` — stores Lambda deployment zips
- **Doc Bucket**: `tax-doc-normalization-dev` — zones: raw/, cleansed/, rejected/, audit/, config/
- **Lambda**: `tax-doc-pdf-ingestion-dev` — code loaded from artifact bucket zip
- **SQS DLQ**: `tax-doc-ingestion-dlq-dev` — 14-day retention
- **CloudWatch**: 30-day log retention
- **IAM**: Least privilege — read raw/config, write cleansed/rejected/audit

## Related Repo

Application code (Lambda handlers, parsers, schemas): [tax-document-normalization-platform](https://github.com/aburmd/tax-document-normalization-platform)
