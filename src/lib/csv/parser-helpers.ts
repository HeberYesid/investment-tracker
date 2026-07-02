import type { ParsedCsvTrade } from "./types";
import { roundPrice, roundMoney } from "./constants";

export function calculatePriceFromTotal(total: number, quantity: number): number {
  if (quantity === 0) return 0;
  return roundPrice(total / quantity);
}

export function createTrade(params: {
  date: string;
  type: ParsedCsvTrade["trade_type"];
  ticker: string;
  quantity: number;
  price: number;
  currency: "USD" | "COP";
  commission?: number;
  fxRate?: number;
}): ParsedCsvTrade {
  return {
    trade_date: params.date,
    trade_type: params.type,
    ticker: params.ticker.toUpperCase(),
    quantity: params.quantity,
    price_original: roundPrice(params.price),
    currency_original: params.currency,
    commission_original: roundMoney(params.commission ?? 0),
    fx_rate_to_usd: params.fxRate ?? (params.currency === "USD" ? 1 : 0),
  };
}

export function validateTradeData(data: {
  ticker?: string;
  quantity?: number;
  price?: number;
  total?: number;
}): boolean {
  if (!data.ticker || data.ticker.trim() === "") return false;
  if (data.quantity !== undefined && data.quantity <= 0) return false;
  if (data.price !== undefined && data.price < 0) return false;
  if (data.total !== undefined && data.total < 0) return false;
  return true;
}
