import * as cdk from "aws-cdk-lib";
import * as glue from "aws-cdk-lib/aws-glue";
import * as athena from "aws-cdk-lib/aws-athena";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface TaxDocAthenaStackProps extends cdk.StackProps {
  environment: string;
  dataBucketName: string;
}

const COLS_1099B_TXNS: glue.CfnTable.ColumnProperty[] = [
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
  { name: "section", type: "string" },
];

const COLS_REALIZED_DETAIL: glue.CfnTable.ColumnProperty[] = [
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
  { name: "symbol", type: "string" },
  { name: "is_option", type: "string" },
  { name: "holding_period", type: "string" },
];

const COLS_REALIZED_SUMMARY: glue.CfnTable.ColumnProperty[] = [
  { name: "category", type: "string" },
  { name: "proceeds", type: "double" },
  { name: "cost_basis", type: "double" },
  { name: "wash_sale", type: "double" },
  { name: "gain_loss", type: "double" },
  { name: "market_discount", type: "double" },
  { name: "realized_gain", type: "double" },
  { name: "realized_loss", type: "double" },
  { name: "disallowed_loss", type: "double" },
  { name: "net_gain_loss", type: "double" },
];

const COLS_1099DIV: glue.CfnTable.ColumnProperty[] = [
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
];

const COLS_1099INT: glue.CfnTable.ColumnProperty[] = [
  { name: "interest_income", type: "double" },
  { name: "us_savings_bond_interest", type: "double" },
  { name: "federal_tax_withheld", type: "double" },
  { name: "tax_exempt_interest", type: "double" },
  { name: "market_discount", type: "double" },
  { name: "bond_premium", type: "double" },
  { name: "state_tax_withheld", type: "double" },
];

const COLS_STMT_TXNS: glue.CfnTable.ColumnProperty[] = [
  { name: "date", type: "string" },
  { name: "category", type: "string" },
  { name: "symbol", type: "string" },
  { name: "description", type: "string" },
  { name: "quantity", type: "double" },
  { name: "price", type: "double" },
  { name: "amount", type: "double" },
];

const COLS_STMT_POSITIONS: glue.CfnTable.ColumnProperty[] = [
  { name: "type", type: "string" },
  { name: "symbol", type: "string" },
  { name: "description", type: "string" },
  { name: "beginning_balance", type: "double" },
  { name: "ending_balance", type: "double" },
  { name: "change_in_period", type: "double" },
  { name: "beginning_market_value", type: "double" },
  { name: "quantity", type: "double" },
  { name: "price", type: "double" },
  { name: "market_value", type: "double" },
  { name: "cost_basis", type: "double" },
  { name: "unrealized_gain_loss", type: "double" },
  { name: "pct_of_account", type: "int" },
];

export class TaxDocAthenaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TaxDocAthenaStackProps) {
    super(scope, id, props);

    const env = props.environment;
    const bucketName = props.dataBucketName;
    const dbName = `tax_doc_parsing_only_${env}`;

    const database = new glue.CfnDatabase(this, "GlueDatabase", {
      catalogId: this.account,
      databaseInput: { name: dbName, description: "Tax Document Normalization — Raw Parsed Data from PDFs" },
    });

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

    const partitionKeys: glue.CfnTable.ColumnProperty[] = [
      { name: "account_type", type: "string" },
      { name: "tax_year", type: "string" },
    ];

    const tables: Record<string, { columns: glue.CfnTable.ColumnProperty[]; broker: string; section: string }> = {
      // Schwab
      schwab_transactions_1099b:          { columns: COLS_1099B_TXNS, broker: "schwab", section: "transactions_1099b" },
      schwab_realized_gain_loss_detail:   { columns: COLS_REALIZED_DETAIL, broker: "schwab", section: "realized_gain_loss_detail" },
      schwab_realized_gain_loss_summary:  { columns: COLS_REALIZED_SUMMARY, broker: "schwab", section: "realized_gain_loss_summary" },
      schwab_dividends_1099div:           { columns: COLS_1099DIV, broker: "schwab", section: "dividends_1099div" },
      schwab_interest_1099int:            { columns: COLS_1099INT, broker: "schwab", section: "interest_1099int" },
      schwab_statement_transactions:      { columns: COLS_STMT_TXNS, broker: "schwab", section: "transactions" },
      schwab_statement_positions:         { columns: COLS_STMT_POSITIONS, broker: "schwab", section: "positions" },
      // Fidelity — column order matches Fidelity parser CSV output
      fidelity_transactions_1099b:        { columns: [
        { name: "symbol", type: "string" },
        { name: "cusip", type: "string" },
        { name: "description", type: "string" },
        { name: "quantity", type: "double" },
        { name: "date_acquired", type: "string" },
        { name: "date_sold", type: "string" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "wash_sale_loss_disallowed", type: "double" },
        { name: "realized_gain_loss", type: "double" },
        { name: "section", type: "string" },
        { name: "holding_period", type: "string" },
      ], broker: "fidelity", section: "transactions_1099b" },
      fidelity_realized_gain_loss_detail: { columns: [
        { name: "symbol", type: "string" },
        { name: "description", type: "string" },
        { name: "quantity", type: "double" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "realized_gain_loss", type: "double" },
        { name: "cusip", type: "string" },
        { name: "holding_period", type: "string" },
        { name: "is_option", type: "string" },
      ], broker: "fidelity", section: "realized_gain_loss_detail" },
      fidelity_realized_gain_loss_summary:{ columns: [
        { name: "category", type: "string" },
        { name: "proceeds", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "market_discount", type: "double" },
        { name: "wash_sale", type: "double" },
        { name: "gain_loss", type: "double" },
        { name: "realized_gain", type: "double" },
        { name: "realized_loss", type: "double" },
        { name: "disallowed_loss", type: "double" },
        { name: "net_gain_loss", type: "double" },
      ], broker: "fidelity", section: "realized_gain_loss_summary" },
      fidelity_dividends_1099div:         { columns: [
        { name: "total_ordinary_dividends", type: "double" },
        { name: "qualified_dividends", type: "double" },
        { name: "total_capital_gain_distributions", type: "double" },
        { name: "nondividend_distributions", type: "double" },
        { name: "federal_tax_withheld", type: "double" },
        { name: "foreign_tax_paid", type: "double" },
        { name: "exempt_interest_dividends", type: "double" },
        { name: "state_tax_withheld", type: "double" },
      ], broker: "fidelity", section: "dividends_1099div" },
      fidelity_interest_1099int:          { columns: COLS_1099INT, broker: "fidelity", section: "interest_1099int" },
      fidelity_statement_transactions:    { columns: COLS_STMT_TXNS, broker: "fidelity", section: "transactions" },
      fidelity_statement_positions:       { columns: [
        { name: "type", type: "string" },
        { name: "symbol", type: "string" },
        { name: "description", type: "string" },
        { name: "beginning_market_value", type: "double" },
        { name: "quantity", type: "double" },
        { name: "price", type: "double" },
        { name: "market_value", type: "double" },
        { name: "cost_basis", type: "double" },
        { name: "unrealized_gain_loss", type: "double" },
      ], broker: "fidelity", section: "positions" },
    };

    for (const [tableName, cfg] of Object.entries(tables)) {
      new glue.CfnTable(this, `Table_${tableName}`, {
        catalogId: this.account,
        databaseName: dbName,
        tableInput: {
          name: tableName,
          tableType: "EXTERNAL_TABLE",
          parameters: {
            "skip.header.line.count": "1",
            "classification": "csv",
            "use.null.for.invalid.data": "true",
          },
          partitionKeys,
          storageDescriptor: {
            columns: cfg.columns,
            location: `s3://${bucketName}/cleansed/${cfg.broker}/${cfg.section}/`,
            inputFormat: "org.apache.hadoop.mapred.TextInputFormat",
            outputFormat: "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat",
            serdeInfo: {
              serializationLibrary: "org.apache.hadoop.hive.serde2.OpenCSVSerde",
              parameters: { separatorChar: ",", quoteChar: '"', escapeChar: "\\" },
            },
          },
        },
      }).addDependency(database);
    }

    new cdk.CfnOutput(this, "GlueDatabaseName", { value: dbName });
    new cdk.CfnOutput(this, "AthenaWorkgroupName", { value: `tax-doc-workgroup-${env}` });
  }
}
