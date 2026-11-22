import type { BrokerCode } from "@/lib/reference/brokers";

export type ParsedCsvTrade = {
  trade_date: string;
  trade_type: "BUY" | "SELL" | "DIVIDEND" | "FEE" | "TRANSFER_IN" | "TRANSFER_OUT";
  ticker: string;
  source_symbol?: string;
  quantity: number;
  price_original: number;
  currency_original: "USD" | "COP";
  commission_original: number;
  fx_rate_to_usd: number;
};

export type RawCsvRow = Record<string, string>;

export type CsvParseIssue = {
  issue: "XTB_FEE_SYMBOL" | "XTB_FEE_AMOUNT" | "XTB_FEE_DATE";
  raw: RawCsvRow;
};

export type CsvParseRow = ParsedCsvTrade | CsvParseIssue;

export type FileFormat = "csv" | "xlsx" | "xls" | "html" | "unknown";

export interface CsvBrokerParser {
  readonly brokerCode: BrokerCode;
  readonly supportedFormats: readonly FileFormat[];
  /**
   * Parses the given file buffer into ordered trades and recognized issues.
   * The parser is responsible for finding the right sheet/rows internally.
   */
  parse(
    fileName: string,
    buffer: ArrayBuffer,
    options?: { purchaseDate?: string },
  ): CsvParseRow[];
}

export type CsvImportStatus = "PREVIEWED" | "COMMITTED" | "FAILED";

export type RowValidationStatus = "VALID" | "INVALID";

export type CsvImport = {
  id: string;
  portfolio_id: string;
  broker_id: string;
  file_name: string;
  status: CsvImportStatus;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_at: string;
};

export type CsvImportRow = {
  id: string;
  import_id: string;
  row_number: number;
  raw_data_json: RawCsvRow;
  parsed_data_json: ParsedCsvTrade | null;
  validation_status: RowValidationStatus;
  validation_error: string | null;
};
