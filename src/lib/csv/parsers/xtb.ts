import { readFile } from "../file-reader";
import { parseXtbDate, parseEnglishNumber, todayString } from "../date-parsers";
import { normalizeXtbTicker, parseXtbTradeComment } from "../xtb-comment-parser";
import type { CsvBrokerParser, CsvParseRow, RawCsvRow } from "../types";
import { createTrade, validateTradeData } from "../parser-helpers";
import { roundMoney } from "../constants";
import { CatalogTicker } from "@/lib/validations/asset-catalog";

function parseFee(row: RawCsvRow, ticker: string, normalizedTicker: string, rawAmount?: number): CsvParseRow {
  if (!ticker || normalizedTicker === "UNKNOWN" || !CatalogTicker.safeParse(normalizedTicker).success) {
    return { issue: "XTB_FEE_SYMBOL", raw: row };
  }

  const time = row.Time ?? "";
  const iso = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  const dayFirst = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  const date = iso.test(time) || dayFirst.test(time) ? parseXtbDate(time) : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) {
    return { issue: "XTB_FEE_DATE", raw: row };
  }
  const utc = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== date) {
    return { issue: "XTB_FEE_DATE", raw: row };
  }

  const literal = row.Amount ?? "";
  const amount = rawAmount ?? (/^-(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(literal)
    ? Number(literal.replaceAll(",", "")) : Number.NaN);
  const commission = roundMoney(-amount);
  if (!(amount < 0 && Number.isFinite(commission) && commission > 0)) {
    return { issue: "XTB_FEE_AMOUNT", raw: row };
  }

  return { ...createTrade({ date, type: "FEE", ticker: normalizedTicker, quantity: 0,
    price: 0, currency: "USD", commission, fxRate: 1 }), source_symbol: ticker };
}

export class XtbParser implements CsvBrokerParser {
  readonly brokerCode = "XTB" as const;
  readonly supportedFormats = ["xlsx", "xls"] as const;

  parse(fileName: string, buffer: ArrayBuffer): CsvParseRow[] {
    const { sheets } = readFile(fileName, buffer, {
      skipRows: {
        "Closed Positions": 4,
        "Cash Operations": 4,
      },
      rawNumberColumn: "Amount",
    });
    const cashOpsSheet =
      sheets.find((s) => s.name.toLowerCase().includes("cash operations")) ??
      sheets[0];

    if (!cashOpsSheet) return [];

    const trades: CsvParseRow[] = [];
    for (const [index, row] of cashOpsSheet.rows.entries()) {
      const type = (row["Type"] ?? "").trim();
      const ticker = (row["Ticker"] ?? "").trim();
      const normalizedTicker = ticker ? normalizeXtbTicker(ticker) : "";
      if (type === "Withholding tax" || type === "SEC fee") {
        trades.push(parseFee(row, ticker, normalizedTicker, cashOpsSheet.rawNumbers?.[index]));
        continue;
      }
      const time = row["Time"] ?? "";
      const amount = parseEnglishNumber(row["Amount"] ?? "");
      const comment = (row["Comment"] ?? "").trim();

      const date = parseXtbDate(time) ?? todayString();

      if (type === "Stock purchase" || type === "Stock sell") {
        const detail = parseXtbTradeComment(comment);
        if (!detail || !normalizedTicker) continue;
        if (!validateTradeData({ ticker: normalizedTicker, quantity: detail.volume, price: detail.price })) continue;

        trades.push(
          { ...createTrade({
            date,
            type: type === "Stock purchase" ? "BUY" : "SELL",
            ticker: normalizedTicker,
            quantity: detail.volume,
            price: detail.price,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          }), source_symbol: ticker }
        );
      } else if (type === "Dividend") {
        if (!validateTradeData({ ticker: normalizedTicker, total: amount })) continue;

        trades.push(
          { ...createTrade({
            date,
            type: "DIVIDEND",
            ticker: normalizedTicker,
            quantity: 1,
            price: amount,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          }), source_symbol: ticker }
        );
      }
    }
    return trades;
  }
}
