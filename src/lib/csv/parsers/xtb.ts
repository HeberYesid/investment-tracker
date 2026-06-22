import { readFile } from "../file-reader";
import { parseXtbDate, parseEnglishNumber, todayString } from "../date-parsers";
import { normalizeXtbTicker, parseXtbTradeComment } from "../xtb-comment-parser";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";
import { createTrade, validateTradeData } from "../parser-helpers";
import { roundMoney } from "../constants";

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
      const time = row["Time"] ?? "";
      const amount = parseEnglishNumber(row["Amount"] ?? "");
      const comment = (row["Comment"] ?? "").trim();

      const date = parseXtbDate(time) ?? todayString();
      const normalizedTicker = ticker ? normalizeXtbTicker(ticker) : "";

      if (type === "Stock purchase" || type === "Stock sell") {
        const detail = parseXtbTradeComment(comment);
        if (!detail || !normalizedTicker) continue;
        if (!validateTradeData({ ticker: normalizedTicker, quantity: detail.volume, price: detail.price })) continue;

        trades.push(
          createTrade({
            date,
            type: type === "Stock purchase" ? "BUY" : "SELL",
            ticker: normalizedTicker,
            quantity: detail.volume,
            price: detail.price,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          })
        );
      } else if (type === "Dividend") {
        if (!validateTradeData({ ticker: normalizedTicker, total: amount })) continue;

        trades.push(
          createTrade({
            date,
            type: "DIVIDEND",
            ticker: normalizedTicker,
            quantity: 1,
            price: amount,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          })
        );
      } else if (type === "Withholding tax" || type === "SEC fee") {
        const feeAmount = Math.abs(amount);
        if (!normalizedTicker || feeAmount <= 0) continue;

        trades.push(
          createTrade({
            date,
            type: "FEE",
            ticker: normalizedTicker,
            quantity: 0,
            price: 0,
            currency: "USD",
            commission: roundMoney(feeAmount),
            fxRate: 1,
          })
        );
      }
    }
    return trades;
  }
}
