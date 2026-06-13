import { readFile } from "../file-reader";
import { parseXtbDate, parseEnglishNumber, todayString } from "../date-parsers";
import {
  normalizeXtbTicker,
  parseXtbTradeComment,
} from "../xtb-comment-parser";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";

/**
 * XTB cash operations XLSX parser.
 *
 * Reads the "Cash Operations" sheet. Has metadata rows before the data table.
 * Processes these operation types:
 * - "Stock purchase" → BUY (parse volume/price from Comment)
 * - "Stock sell" → SELL (parse volume/price from Comment)
 * - "Dividend" → DIVIDEND
 * - "Withholding tax" → FEE (with negative amount, so we store as positive commission)
 * - "SEC fee" → FEE
 *
 * Skips: "Deposit", "Correction"
 */
export class XtbParser implements CsvBrokerParser {
  readonly brokerCode = "XTB" as const;
  readonly supportedFormats = ["xlsx", "xls"] as const;

  parse(fileName: string, buffer: ArrayBuffer): ParsedCsvTrade[] {
    const { sheets } = readFile(fileName, buffer, {
      skipRows: {
        "Closed Positions": 4,
        "Cash Operations": 4,
      },
    });
    const cashOpsSheet =
      sheets.find((s) => s.name.toLowerCase().includes("cash operations")) ??
      sheets[0];

    if (!cashOpsSheet) return [];

    const trades: ParsedCsvTrade[] = [];
    for (const row of cashOpsSheet.rows) {
      const type = (row["Type"] ?? "").trim();
      const ticker = (row["Ticker"] ?? "").trim();
      const instrument = (row["Instrument"] ?? "").trim();
      const time = row["Time"] ?? "";
      const amount = parseEnglishNumber(row["Amount"] ?? "");
      const comment = (row["Comment"] ?? "").trim();

      const date = parseXtbDate(time) ?? todayString();
      const normalizedTicker = ticker ? normalizeXtbTicker(ticker) : "";

      if (type === "Stock purchase") {
        const detail = parseXtbTradeComment(comment);
        if (!detail || !normalizedTicker) continue;
        trades.push({
          trade_date: date,
          trade_type: "BUY",
          ticker: normalizedTicker,
          quantity: detail.volume,
          price_original: Math.round(detail.price * 1000000) / 1000000,
          currency_original: "USD",
          commission_original: 0,
          fx_rate_to_usd: 1,
        });
      } else if (type === "Stock sell") {
        const detail = parseXtbTradeComment(comment);
        if (!detail || !normalizedTicker) continue;
        trades.push({
          trade_date: date,
          trade_type: "SELL",
          ticker: normalizedTicker,
          quantity: detail.volume,
          price_original: Math.round(detail.price * 1000000) / 1000000,
          currency_original: "USD",
          commission_original: 0,
          fx_rate_to_usd: 1,
        });
      } else if (type === "Dividend") {
        if (!normalizedTicker || amount <= 0) continue;
        trades.push({
          trade_date: date,
          trade_type: "DIVIDEND",
          ticker: normalizedTicker,
          quantity: 1,
          price_original: Math.round(amount * 100) / 100,
          currency_original: "USD",
          commission_original: 0,
          fx_rate_to_usd: 1,
        });
      } else if (type === "Withholding tax" || type === "SEC fee") {
        if (!normalizedTicker) continue;
        const feeAmount = Math.abs(amount);
        if (feeAmount <= 0) continue;
        trades.push({
          trade_date: date,
          trade_type: "FEE",
          ticker: normalizedTicker,
          quantity: 0,
          price_original: 0,
          currency_original: "USD",
          commission_original: Math.round(feeAmount * 100) / 100,
          fx_rate_to_usd: 1,
        });
      }
      // Skip: "Deposit", "Correction", "Total", "Profit/loss"
    }
    return trades;
  }
}
