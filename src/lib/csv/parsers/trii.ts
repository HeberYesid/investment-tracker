import { readFile } from "../file-reader";
import { parseSpanishDate, parseEnglishNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";
import { createTrade, calculatePriceFromTotal, validateTradeData } from "../parser-helpers";

export class TriiParser implements CsvBrokerParser {
  readonly brokerCode = "TRII" as const;
  readonly supportedFormats = ["csv"] as const;

  parse(fileName: string, buffer: ArrayBuffer): ParsedCsvTrade[] {
    const { sheets } = readFile(fileName, buffer);
    const sheet = sheets[0];
    if (!sheet) return [];

    const trades: ParsedCsvTrade[] = [];
    for (const row of sheet.rows) {
      const fechaHora = (row["Fecha y hora"] ?? "").trim();
      const ticker = (row["Símbolo de la acción"] ?? row["Simbolo de la accion"] ?? "").trim();
      const tipoOrden = (row["Tipo de orden"] ?? "").trim();
      const estado = (row["Estado"] ?? "").trim();
      const accionesCompletadas = parseEnglishNumber(
        row["Acciones completadas"] ?? "0",
      );
      const precioPorAccion = parseEnglishNumber(
        row["Precio por acción"] ?? row["Precio por accion"] ?? "0",
      );
      const valorComision = parseEnglishNumber(row["Valor comisión"] ?? row["Valor comision"] ?? "0");

      if (estado.toLowerCase() === "cancelado") continue;
      if (estado && estado.toLowerCase() !== "aprobado") continue;

      if (!validateTradeData({ ticker, quantity: accionesCompletadas, price: precioPorAccion })) continue;

      const tradeType = mapTriiAction(tipoOrden);
      if (!tradeType) continue;

      const date = parseSpanishDate(fechaHora) ?? todayString();

      trades.push(
        createTrade({
          date,
          type: tradeType,
          ticker,
          quantity: accionesCompletadas,
          price: precioPorAccion,
          currency: "COP",
          commission: valorComision,
          fxRate: 0,
        })
      );
    }
    return trades;
  }
}

function mapTriiAction(action: string): ParsedCsvTrade["trade_type"] | null {
  const normalized = action.toLowerCase();
  if (normalized === "compra") return "BUY";
  if (normalized === "venta") return "SELL";
  if (normalized === "transferencia_entrada") return "TRANSFER_IN";
  if (normalized === "transferencia_salida") return "TRANSFER_OUT";
  return null;
}
