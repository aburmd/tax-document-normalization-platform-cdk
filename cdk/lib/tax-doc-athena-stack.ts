import * as cdk from "aws-cdk-lib";
import * as glue from "aws-cdk-lib/aws-glue";
import * as athena from "aws-cdk-lib/aws-athena";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface TaxDocAthenaStackProps extends cdk.StackProps {
  environment: string;
  dataBucketName: string;
}

export class TaxDocAthenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TaxDocAthenaStackProps) {
    super(scope, id, props);

    const env = props.environment;
    const bucketName = props.dataBucketName;
    const dbName = `tax_doc_${env}`;

    // Glue Database
    const database = new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: this.account,
      databaseInput: {
        name: dbName,
        description: "Tax Document Normalization Platform",
      },
    });

    // Athena Workgroup
    const resultsBucket = s3.Bucket.fromBucketName(
      this,
      "DataBucket",
      bucketName
    );
    new athena.CfnWorkGroup(this, "AthenaWorkgroup", {
      name: `tax-doc-workgroup-${env}`,
      state: "ENABLED",
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${bucketName}/athena-results/`,
          encryptionConfiguration: { encryptionOption: "SSE_S3" },
        },
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: true,
      },
    });

    // === Schwab Tables ===
    const schwabTables: Record<string, glue.CfnTable.ColumnProperty[]> = {
      schwab_transactions_1099b: [
        { name: "quantity", type: "double" },
        { name: "description", type: "string" },
        { name: "action", type: "string" },
        { name: "date_acquired", type: "string" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "wash_sale_loss_disallowed", type: "double" },
        { name: "realized_gain_loss", type: "double" },
        { name: "cusip", type: "string" },
        { name: "symbol", type: "string" },
        { name: "date_sold", type: "string" },
        { name: "holding_period", type: "string" },
        { name: "irs_reporting", type: "string" },
      ],
      schwab_realized_gain_loss_detail: [
        { name: "description", type: "string" },
        { name: "cusip", type: "string" },
        { name: "quantity", type: "double" },
        { name: "date_acquired", type: "string" },
        { name: "date_sold", type: "string" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "wash_sale_loss_disallowed", type: "double" },
        { name: "realized_gain_loss", type: "double" },
        { name: "section", type: "string" },
      ],
      schwab_realized_gain_loss_summary: [
        { name: "category", type: "string" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "wash_sale", type: "double" },
        { name: "gain_loss", type: "double" },
      ],
      schwab_dividends_1099div: [
        { name: "total_ordinary_dividends", type: "double" },
        { name: "qualified_dividends", type: "double" },
        { name: "total_capital_gain_distributions", type: "double" },
        { name: "unrecap_sec_1250_gain", type: "double" },
        { name: "section_1202_gain", type: "double" },
        { name: "collectibles_gain", type: "double" },
        { name: "section_897_ordinary", type: "double" },
        { name: "section_897_capital_gains", type: "double" },
        { name: "nondividend_distributions", type: "double" },
        { name: "federal_tax_withheld", type: "double" },
        { name: "section_199a_dividends", type: "double" },
        { name: "investment_expenses", type: "double" },
        { name: "foreign_tax_paid", type: "double" },
        { name: "exempt_interest_dividends", type: "double" },
        { name: "state_tax_withheld", type: "double" },
      ],
      schwab_interest_1099int: [
        { name: "interest_income", type: "double" },
        { name: "us_savings_bond_interest", type: "double" },
        { name: "federal_tax_withheld", type: "double" },
        { name: "tax_exempt_interest", type: "double" },
        { name: "market_discount", type: "double" },
        { name: "bond_premium", type: "double" },
        { name: "state_tax_withheld", type: "double" },
      ],
      schwab_statement_transactions: [
        { name: "date", type: "string" },
        { name: "category", type: "string" },
        { name: "symbol", type: "string" },
        { name: "description", type: "string" },
        { name: "quantity", type: "double" },
        { name: "price", type: "double" },
        { name: "amount", type: "double" },
      ],
      schwab_statement_positions: [
        { name: "type", type: "string" },
        { name: "symbol", type: "string" },
        { name: "description", type: "string" },
        { name: "quantity", type: "double" },
        { name: "price", type: "double" },
        { name: "market_value", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "unrealized_gain_loss", type: "double" },
        { name: "beginning_balance", type: "double" },
        { name: "ending_balance", type: "double" },
        { name: "change_in_period", type: "double" },
        { name: "pct_of_account", type: "int" },
      ],
    };

    // Map table name → S3 section name (the key in canonical output)
    const sectionMap: Record<string, string> = {
      schwab_transactions_1099b: "transactions_1099b",
      schwab_realized_gain_loss_detail: "realized_gain_loss_detail",
      schwab_realized_gain_loss_summary: "realized_gain_loss_summary",
      schwab_dividends_1099div: "dividends_1099div",
      schwab_interest_1099int: "interest_1099int",
      schwab_statement_transactions: "transactions",
      schwab_statement_positions: "positions",
    };

    const partitionKeys: glue.CfnTable.ColumnProperty[] = [
      { name: "account_type", type: "string" },
      { name: "tax_year", type: "string" },
    ];

    for (const [tableName, columns] of Object.entries(schwabTables)) {
      const section = sectionMap[tableName];
      new glue.CfnTable(this, `Table_${tableName}`, {
        catalogId: this.account,
        databaseName: dbName,
        tableInput: {
          name: tableName,
          tableType: "EXTERNAL_TABLE",
          parameters: {
            "skip.header.line.count": "1",
            "classification": "csv",
          },
          partitionKeys,
          storageDescriptor: {
            columns,
            location: `s3://${bucketName}/cleansed/schwab/${section}/`,
            inputFormat:
              "org.apache.hadoop.mapred.TextInputFormat",
            outputFormat:
              "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
            serdeInfo: {
              serializationLibrary:
                "org.apache.hadoop.hive.serde2.OpenCSVSerde",
              parameters: {
                separatorChar: ",",
                quoteChar: '"',
                escapeChar: "\\",
              },
            },
          },
        },
      }).addDependency(database);
    }

    // Outputs
    new cdk.CfnOutput(this, "GlueDatabaseName", { value: dbName });
    new cdk.CfnOutput(this, "AthenaWorkgroupName", {
      value: `tax-doc-workgroup-${env}`,
    });
  }
}
