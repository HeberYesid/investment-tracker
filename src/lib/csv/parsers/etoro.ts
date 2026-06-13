import { readFile } from "../file-reader";
import { parseEtoroDate, parseEnglishNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";

/**
 * eToro account statement XLSX parser.
 *
 * Reads the "Actividad de la cuenta" (Account Activity) sheet which contains:
 * - "Posición abierta" → BUY (Importe / Unidades = price)
 * - "Dividendo" → DIVIDEND
 * - "Depósito" → ignored (not a trade)
 *
 * The "Posiciones cerradas" sheet is read if it has data (for closed positions).
 */
export class EtoroParser implements CsvBrokerParser {
  readonly brokerCode = "ETORO" as const;
  readonly supportedFormats = ["xlsx", "xls"] as const;

  parse(fileName: string, buffer: ArrayBuffer): ParsedCsvTrade[] {
    const { sheets } = readFile(fileName, buffer);
    const trades: ParsedCsvTrade[] = [];

    // Process "Posiciones cerradas" (Closed Positions) first if present
    const closedSheet = sheets.find((s) =>
      s.name.toLowerCase().includes("posiciones cerradas"),
    );
    if (closedSheet) {
      trades.push(...this.parseClosedPositions(closedSheet.rows));
    }

    // Process "Actividad de la cuenta" (Account Activity)
    const activitySheet = sheets.find(
      (s) =>
        s.name.toLowerCase().includes("actividad") ||
        s.name.toLowerCase().includes("activity"),
    );
    if (activitySheet) {
      trades.push(...this.parseAccountActivity(activitySheet.rows));
    }

    return trades;
  }

  private parseClosedPositions(rows: Record<string, string>[]): ParsedCsvTrade[] {
    const trades: ParsedCsvTrade[] = [];
    for (const row of rows) {
      const action = (row["Acción"] ?? row["Accion"] ?? "").trim().toUpperCase();
      const importe = parseEnglishNumber(row["Importe"] ?? "");
      const unidades = parseEnglishNumber(row["Unidades"] ?? "");
      const fechaApertura = row["Fecha de apertura"] ?? "";
      const comisionSpread = parseEnglishNumber(
        row["Comisiones de diferencial (USD)"] ?? row["Comisiones de diferencial"] ?? "0",
      );
      const comisionNocturna = parseEnglishNumber(
        row["Comisiones nocturnas y dividendos"] ?? "0",
      );
      const tipo = (row["Tipo"] ?? "").trim();

      if (!action || !importe || !unidades) continue;
      if (unidades <= 0) continue;

      const tradeType = mapEtoroAction(action);
      if (!tradeType) continue;

      const price = importe / unidades;
      const date = parseEtoroDate(fechaApertura) ?? todayString();

      trades.push({
        trade_date: date,
        trade_type: tradeType,
        ticker: tipo.toUpperCase(),
        quantity: unidades,
        price_original: Math.round(price * 1000000) / 1000000,
        currency_original: "USD",
        commission_original:
          Math.round((comisionSpread + comisionNocturna) * 100) / 100,
        fx_rate_to_usd: 1,
      });
    }
    return trades;
  }

  private parseAccountActivity(rows: Record<string, string>[]): ParsedCsvTrade[] {
    const trades: ParsedCsvTrade[] = [];
    for (const row of rows) {
      const tipo = (row["Tipo"] ?? "").trim();
      const fecha = row["Fecha"] ?? "";
      const detalles = (row["Detalles"] ?? "").trim();
      const importe = parseEnglishNumber(row["Importe"] ?? "");
      const unidadesStr = row["Unidades"] ?? "";
      const unidades = unidadesStr === "-" ? 0 : parseEnglishNumber(unidadesStr);

      const date = parseEtoroDate(fecha) ?? todayString();

      if (tipo === "Posición abierta" || tipo === "Posicion abierta") {
        if (importe <= 0 || unidades <= 0) continue;
        const price = importe / unidades;
        // Detalles is like "SPYG/USD" — extract ticker
        const ticker = detalles.split("/")[0]?.toUpperCase() ?? "UNKNOWN";
        trades.push({
          trade_date: date,
          trade_type: "BUY",
          ticker,
          quantity: unidades,
          price_original: Math.round(price * 1000000) / 1000000,
          currency_original: "USD",
          commission_original: 0,
          fx_rate_to_usd: 1,
        });
      } else if (tipo === "Dividendo") {
        if (importe <= 0) continue;
        const ticker = detalles.split("/")[0]?.toUpperCase() ?? "UNKNOWN";
        trades.push({
          trade_date: date,
          trade_type: "DIVIDEND",
          ticker,
          quantity: 1, // Dividends are per-share, use 1 for total
          price_original: Math.round(importe * 100) / 100,
          currency_original: "USD",
          commission_original: 0,
          fx_rate_to_usd: 1,
        });
      }
      // Skip: "Depósito", "Reembolso", etc.
    }
    return trades;
  }
}

function mapEtoroAction(action: string): ParsedCsvTrade["trade_type"] | null {
  switch (action) {
    case "BUY":
    case "COMPRA":
      return "BUY";
    case "SELL":
    case "VENTA":
      return "SELL";
    default:
      return null;
  }
}
