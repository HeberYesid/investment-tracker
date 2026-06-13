import { readFile } from "../file-reader";
import { parseColombianNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";

/**
 * eTrading Bancolombia portfolio snapshot parser.
 *
 * The "XLS" file is actually an HTML table. Columns:
 *   Especie | Descripción | Mercado | Precio Actual | Valor Actual |
 *   Variación % | Cant Total | Cant Bloq | Cant Pend | Cant Ejecutada |
 *   Disp. P/ Venta | Precio Promedio | Ganancias/Pérdidas | Del Valor Medio
 *
 * For each holding we generate a BUY trade using:
 * - ticker: Especie (uppercased)
 * - quantity: Cant Total
 * - price_original: Precio Promedio
 * - date: today (or user-supplied purchaseDate) — NOT known from snapshot
 * - commission: 0 (not known from snapshot)
 * - currency: COP
 *
 * Note: This is a snapshot, not a transaction history. The user must
 * confirm/edit the purchase date in the preview step.
 */
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

      if (!especie) continue;
      if (cantidad <= 0) continue;
      if (precioPromedio < 0) continue;

      trades.push({
        trade_date: purchaseDate,
        trade_type: "BUY",
        ticker: especie.toUpperCase(),
        quantity: cantidad,
        price_original: Math.round(precioPromedio * 100) / 100,
        currency_original: "COP",
        commission_original: 0,
        fx_rate_to_usd: 0, // Will be filled by preview/commit flow
      });
    }
    return trades;
  }
}
