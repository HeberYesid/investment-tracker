import type { CsvParseRow, ParsedCsvTrade, RawCsvRow } from "./types";
import type { BrokerCode } from "@/lib/reference/brokers";
import { TradeQuantityInput } from "@/lib/validations/trades";
import { getImportLabels } from "@/lib/i18n/imports";

export type RowValidation = {
  rowNumber: number;
  valid: boolean;
  error: string | null;
  parsed: ParsedCsvTrade | null;
  raw: RawCsvRow;
};

/**
 * Validates parsed CSV rows against business rules.
 * - Checks currency consistency with broker defaults
 * - Ensures required fields are present
 * - Flags duplicate rows
 * - Returns per-row validation results
 */
export function validateParsedRows(
  rows: CsvParseRow[],
  brokerCode: BrokerCode,
): RowValidation[] {
  const results: RowValidation[] = [];
  const seenHashes = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    if ("issue" in row) {
      results.push({ rowNumber, valid: false, error: getImportLabels().xtbFeeIssues[row.issue], parsed: null, raw: row.raw });
      continue;
    }
    const raw: RawCsvRow = {
      trade_date: row.trade_date,
      trade_type: row.trade_type,
      ticker: row.ticker,
      quantity: String(row.quantity),
      price_original: String(row.price_original),
      currency_original: row.currency_original,
      commission_original: String(row.commission_original),
      fx_rate_to_usd: String(row.fx_rate_to_usd),
    };

    const errors: string[] = [];

    // Currency validation: broker must match unless the row has explicit currency
    const expectedCurrency = getBrokerDefaultCurrency(brokerCode);
    if (row.currency_original !== expectedCurrency) {
      errors.push(
        `Moneda inesperada "${row.currency_original}" para ${brokerCode}. Se esperaba "${expectedCurrency}".`,
      );
    }

    // COP trades must have a valid FX rate
    if (row.currency_original === "COP" && row.fx_rate_to_usd <= 0) {
      errors.push(
        "Las operaciones en COP requieren una tasa de cambio (fx_rate_to_usd) válida.",
      );
    }

    // USD trades should have fx_rate = 1
    if (row.currency_original === "USD" && row.fx_rate_to_usd !== 1) {
      errors.push(
        "Las operaciones en USD deben tener fx_rate_to_usd igual a 1.",
      );
    }

    const pair = TradeQuantityInput.safeParse(row);
    if (!pair.success) errors.push(...pair.error.issues.map(({ message }) => message));

    // Price must be non-negative
    if (row.price_original < 0) {
      errors.push("El precio no puede ser negativo.");
    }

    // Commission must be non-negative
    if (row.commission_original < 0) {
      errors.push("La comisión no puede ser negativa.");
    }

    // Ticker required
    if (!row.ticker || row.ticker === "UNKNOWN") {
      errors.push("El ticker es requerido y no pudo ser extraído del CSV.");
    }

    // Date must be valid
    if (!isValidDate(row.trade_date)) {
      errors.push(`Fecha inválida: "${row.trade_date}".`);
    }

    // Duplicate detection (hash of key fields)
    const hash = hashRow(row);
    if (seenHashes.has(hash)) {
      errors.push("Fila duplicada en el mismo archivo.");
    }
    seenHashes.add(hash);

    results.push({
      rowNumber,
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join(" ") : null,
      parsed: row,
      raw,
    });
  }

  return results;
}

function getBrokerDefaultCurrency(brokerCode: BrokerCode): "USD" | "COP" {
  switch (brokerCode) {
    case "ETORO":
    case "XTB":
      return "USD";
    case "TRII":
    case "ETRADING_BANCOLOMBIA":
      return "COP";
    default:
      return "USD";
  }
}

function isValidDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime());
}

function hashRow(row: ParsedCsvTrade): string {
  return `${row.trade_date}|${row.trade_type}|${row.ticker}|${row.quantity}|${row.price_original}|${row.currency_original}|${row.commission_original}`;
}
