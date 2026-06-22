import { readFile } from "../file-reader";
import { parseEtoroDate, parseEnglishNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";
import { createTrade, calculatePriceFromTotal, validateTradeData } from "../parser-helpers";

export class EtoroParser implements CsvBrokerParser {
  readonly brokerCode = "ETORO" as const;
  readonly supportedFormats = ["xlsx", "xls"] as const;

  parse(fileName: string, buffer: ArrayBuffer): ParsedCsvTrade[] {
    const { sheets } = readFile(fileName, buffer);
    const trades: ParsedCsvTrade[] = [];

    const closedSheet = sheets.find((s) =>
      s.name.toLowerCase().includes("posiciones cerradas"),
    );
    if (closedSheet) {
      trades.push(...this.parseClosedPositions(closedSheet.rows));
    }

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

      if (!validateTradeData({ ticker: tipo, quantity: unidades, total: importe })) continue;

      const tradeType = mapEtoroAction(action);
      if (!tradeType) continue;

      const price = calculatePriceFromTotal(importe, unidades);
      const date = parseEtoroDate(fechaApertura) ?? todayString();

      trades.push(
        createTrade({
          date,
          type: tradeType,
          ticker: tipo,
          quantity: unidades,
          price,
          currency: "USD",
          commission: comisionSpread + comisionNocturna,
          fxRate: 1,
        })
      );
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
      const ticker = detalles.split("/")[0]?.toUpperCase() ?? "UNKNOWN";

      if (tipo === "Posición abierta" || tipo === "Posicion abierta") {
        if (!validateTradeData({ ticker, quantity: unidades, total: importe })) continue;
        const price = calculatePriceFromTotal(importe, unidades);

        trades.push(
          createTrade({
            date,
            type: "BUY",
            ticker,
            quantity: unidades,
            price,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          })
        );
      } else if (tipo === "Dividendo") {
        if (!validateTradeData({ ticker, total: importe })) continue;

        trades.push(
          createTrade({
            date,
            type: "DIVIDEND",
            ticker,
            quantity: 1,
            price: importe,
            currency: "USD",
            commission: 0,
            fxRate: 1,
          })
        );
      }
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
    case "TRANSFER_IN":
    case "TRANSFERENCIA_ENTRADA":
      return "TRANSFER_IN";
    case "TRANSFER_OUT":
    case "TRANSFERENCIA_SALIDA":
      return "TRANSFER_OUT";
    default:
      return null;
  }
}
