import { readFile } from "../file-reader";
import { parseSpanishDate, parseEnglishNumber, todayString } from "../date-parsers";
import type { CsvBrokerParser, ParsedCsvTrade } from "../types";

/**
 * Trii CSV parser (Colombian broker).
 *
 * Format columns:
 *   Fecha y hora | Símbolo de la acción | Tipo de orden | Estado |
 *   Acciones completadas | Acciones pendientes | Precio por acción |
 *   Total invertido | Valor comisión | Total estimado
 *
 * - Tipo de orden: "Compra" (BUY), "Venta" (SELL)
 * - Estado: "Aprobado" (process) / "Cancelado" (filter silently)
 * - Date format: "14 may 2026, 8:43 a. m." (Spanish)
 * - Currency: COP
 */
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

      // Filter out cancelled orders silently
      if (estado.toLowerCase() === "cancelado") continue;
      if (estado && estado.toLowerCase() !== "aprobado") continue;

      if (!fechaHora || !ticker || !tipoOrden) continue;
      if (accionesCompletadas <= 0) continue;
      if (precioPorAccion < 0) continue;

      const tradeType = mapTriiAction(tipoOrden);
      if (!tradeType) continue;

      const date = parseSpanishDate(fechaHora) ?? todayString();

      trades.push({
        trade_date: date,
        trade_type: tradeType,
        ticker: ticker.toUpperCase(),
        quantity: accionesCompletadas,
        price_original: Math.round(precioPorAccion * 100) / 100,
        currency_original: "COP",
        commission_original: Math.round(valorComision * 100) / 100,
        fx_rate_to_usd: 0, // Will be filled by preview/commit flow
      });
    }
    return trades;
  }
}

function mapTriiAction(action: string): ParsedCsvTrade["trade_type"] | null {
  const normalized = action.toLowerCase();
  if (normalized === "compra") return "BUY";
  if (normalized === "venta") return "SELL";
  return null;
}
