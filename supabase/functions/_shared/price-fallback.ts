import { fetchStooqQuote } from "./stooq.ts";
import { fetchYahooQuote, type FetchedQuote, type YahooProviderError, type YahooProviderResult } from "./yahoo.ts";

type PriceResult =
  | { ok: true; value: FetchedQuote; source: "YAHOO" | "STOOQ" }
  | { ok: false; error: YahooProviderError };

export async function fetchPriceWithFallback(symbol: string, allowStooq: boolean): Promise<PriceResult> {
  let primary: YahooProviderResult;
  try {
    primary = await fetchYahooQuote(symbol);
  } catch {
    primary = { ok: false, error: { code: "TRANSIENT", message: `Yahoo: request failed for ${symbol}` } };
  }
  if (primary.ok) return { ...primary, source: "YAHOO" };
  if (!allowStooq) return primary;

  try {
    const quote = await fetchStooqQuote(symbol);
    if (quote) return { ok: true, value: quote, source: "STOOQ" };
  } catch {
    // Retain the primary failure if the fallback also fails.
  }
  return primary;
}
