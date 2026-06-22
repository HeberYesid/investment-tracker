import { readFile } from "../file-reader";
import { parseColombianNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";
import { createTrade, validateTradeData } from "../parser-helpers";

export class EtradingBancolombiaParser implements CsvBrokerParser {
  readonly brokerCode = "ETRADING_BANCOLOMBIA" as const;
  readonly supportedFormats = ["html", "xls"] as const;

  parse(
    fileName: string,
    buffer: ArrayBuffer,
    options?: { purchaseDate?: string },
  ): ParsedCsvTrade[] {
    const { sheets } = readFile(fileName, buffer);
    const sheet = sheets[0];
    if (!sheet) return [];

    const purchaseDate = options?.purchaseDate ?? todayString();
    const trades: ParsedCsvTrade[] = [];

    for (const row of sheet.rows) {
      const especie = (row["Especie"] ?? "").trim();
      const cantidad = parseColombianNumber(row["Cant Total"] ?? "0");
      const precioPromedio = parseColombianNumber(row["Precio Promedio"] ?? "0");

      if (!validateTradeData({ ticker: especie, quantity: cantidad, price: precioPromedio })) continue;

      trades.push(
        createTrade({
          date: purchaseDate,
          type: "BUY",
          ticker: especie,
          quantity: cantidad,
          price: precioPromedio,
          currency: "COP",
          commission: 0,
          fxRate: 0,
        })
      );
    }
    return trades;
  }
}
