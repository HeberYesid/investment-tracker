import { z } from "zod";
import { getMarketDataEnv, type MarketDataEnv } from "./config";
import type { FetchLike, PriceProvider, PriceProviderError } from "./types";

const symbols = new Map([
  ["AAPL", "aapl.us"], ["AMZN", "amzn.us"], ["GOOG", "goog.us"],
  ["GOOGL", "googl.us"], ["META", "meta.us"], ["MSFT", "msft.us"],
  ["NVDA", "nvda.us"], ["SPY", "spy.us"], ["TSLA", "tsla.us"], ["VOO", "voo.us"],
]);
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().nonnegative());
const StooqCsvRowSchema = z.tuple([
  z.string(), z.iso.date(), z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  decimal, decimal, decimal, decimal.pipe(z.number().positive()), decimal,
]);

type Options = { env?: MarketDataEnv; fetchImpl?: FetchLike };
const failure = (code: PriceProviderError["code"], message: string): PriceProviderError => ({ code, message });

export function createStooqProvider({ env = getMarketDataEnv(), fetchImpl = globalThis.fetch }: Options = {}): PriceProvider {
  const malformed = () => failure("INVALID_PAYLOAD", "Stooq returned malformed CSV");

  async function fetchQuote(symbol: string) {
    const mapped = symbols.get(symbol);
    if (!mapped) throw failure("NOT_FOUND", `No Stooq mapping for ${symbol}`);
    const url = new URL("/q/l/", env.stooqBaseUrl ?? "https://stooq.com");
    url.search = new URLSearchParams({ s: mapped, f: "sd2t2ohlcv", h: "", e: "csv" }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "User-Agent": env.userAgent, Accept: "text/csv" },
        signal: AbortSignal.timeout(env.requestTimeoutMs),
      });
    } catch {
      throw failure("TRANSIENT", "Stooq request failed");
    }
    if (response.status === 429) throw failure("RATE_LIMITED", "Stooq rate limited");
    if (!response.ok) throw failure("PERMANENT", `Stooq HTTP ${response.status}`);

    let csv: string;
    try { csv = await response.text(); } catch { throw failure("TRANSIENT", "Stooq response interrupted"); }
    const [header, row, ...extra] = csv.trim().split(/\r?\n/);
    if (header !== "Symbol,Date,Time,Open,High,Low,Close,Volume" || !row || extra.length) throw malformed();
    const parsed = StooqCsvRowSchema.safeParse(row.split(","));
    if (!parsed.success) throw malformed();
    const [ticker, date, time, , , , priceUsd] = parsed.data;
    const observedAt = `${date}T${time}.000Z`;
    const timestamp = new Date(observedAt);
    if (ticker.toLowerCase() !== mapped || !Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== observedAt) throw malformed();
    return { symbol, priceUsd, currency: "USD", observedAt, delayedUntil: null };
  }

  return {
    fetchQuote,
    fetchQuotes: (requested) => Promise.all(requested.map(fetchQuote)),
    async fetchHistory() { throw failure("NOT_FOUND", "Stooq history is not configured"); },
  };
}
