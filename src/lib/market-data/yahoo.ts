import {
  type FetchedHistory,
  type FetchedHistoryPoint,
  type FetchedQuote,
  type FetchLike,
  type PriceProvider,
  type PriceProviderError,
  type YahooRange,
  YAHOO_INTERVAL_BY_RANGE,
  isYahooRange,
} from "./types";
import { getMarketDataEnv, type MarketDataEnv } from "./config";

const CHART_PATH = "/v8/finance/chart/";

export type YahooProviderOptions = {
  fetchImpl?: FetchLike;
  env?: MarketDataEnv;
};

type YahooChartResult = {
  meta?: {
    currency?: string;
    symbol?: string;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
    delayedPrice?: number;
    delayedPriceTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    adjclose?: Array<{ adjclose?: Array<number | null> }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
    error?: { code?: string; description?: string } | null;
  };
};

export function createYahooProvider(opts: YahooProviderOptions = {}): PriceProvider {
  const env = opts.env ?? getMarketDataEnv();
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  async function fetchChart(
    symbol: string,
    params: Record<string, string>,
  ): Promise<YahooChartResult> {
    const url = new URL(`${env.yahooBaseUrl}${CHART_PATH}${encodeURIComponent(symbol)}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(url.toString(), {
        headers: {
          "User-Agent": env.userAgent,
          Accept: "application/json",
        },
      });
    } catch (cause) {
      throw buildError("TRANSIENT", `Error contacting Yahoo Finance: ${symbol}`, cause);
    }

    if (response.status === 429) {
      throw buildError("RATE_LIMITED", `Rate limited by Yahoo Finance: ${symbol}`);
    }
    if (!response.ok) {
      throw buildError(
        "PERMANENT",
        `Yahoo Finance returned ${response.status} for ${symbol}`,
      );
    }

    const body = (await response.json()) as YahooChartResponse;
    const error = body?.chart?.error;
    if (error) {
      throw buildError(
        "PERMANENT",
        `Yahoo Finance error for ${symbol}: ${error.description ?? error.code ?? "unknown"}`,
      );
    }
    const result = body?.chart?.result?.[0];
    if (!result) {
      throw buildError("PERMANENT", `Yahoo Finance returned no result for ${symbol}`);
    }
    return result;
  }

  function buildError(
    code: PriceProviderError["code"],
    message: string,
    cause?: unknown,
  ): PriceProviderError {
    return { code, message, cause };
  }

  function pickQuotePrice(result: YahooChartResult): {
    price: number;
    observedAt: string;
  } {
    const meta = result.meta ?? {};
    const usingDelayed =
      typeof meta.regularMarketPrice !== "number" &&
      typeof meta.delayedPrice === "number";
    const price =
      typeof meta.regularMarketPrice === "number"
        ? meta.regularMarketPrice
        : typeof meta.delayedPrice === "number"
          ? meta.delayedPrice
          : (() => {
              throw buildError(
                "PERMANENT",
                `Yahoo Finance result missing regularMarketPrice for ${meta.symbol ?? "unknown"}`,
              );
            })();
    const ts = usingDelayed ? meta.delayedPriceTime : meta.regularMarketTime;
    if (typeof ts !== "number") {
      throw buildError(
        "PERMANENT",
        `Yahoo Finance result missing market timestamp for ${meta.symbol ?? "unknown"}`,
      );
    }
    return { price, observedAt: new Date(ts * 1000).toISOString() };
  }

  return {
    async fetchQuotes(symbols) {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const result = await fetchChart(symbol, {
              range: "1d",
              interval: "1d",
            });
            const { price, observedAt } = pickQuotePrice(result);
            const quote: FetchedQuote = {
              symbol,
              priceUsd: price,
              currency: result.meta?.currency ?? "USD",
              observedAt,
              delayedUntil: null,
            };
            return { ok: true as const, value: quote };
          } catch (err) {
            return { ok: false as const, error: toProviderError(err) };
          }
        }),
      );
      return results
        .filter((r): r is { ok: true; value: FetchedQuote } => r.ok)
        .map((r) => r.value);
    },

    async fetchHistory(symbol, range) {
      const safeRange: YahooRange = isYahooRange(range) ? range : "1y";
      const interval = YAHOO_INTERVAL_BY_RANGE[safeRange];
      const result = await fetchChart(symbol, {
        range: safeRange,
        interval,
      });
      const meta = result.meta ?? {};
      const adjclose = result.indicators?.adjclose?.[0]?.adjclose;
      const timestamps = result.timestamp ?? [];
      if (!adjclose || adjclose.length !== timestamps.length) {
        throw buildError(
          "PERMANENT",
          `Yahoo Finance result missing adjclose series for ${meta.symbol ?? symbol}`,
        );
      }
      const points: FetchedHistoryPoint[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const value = adjclose[i];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        points.push({
          date: new Date(timestamps[i] * 1000).toISOString(),
          value,
        });
      }
      if (points.length === 0) {
        throw buildError(
          "PERMANENT",
          `Yahoo Finance returned no numeric history points for ${meta.symbol ?? symbol}`,
        );
      }
      const history: FetchedHistory = {
        symbol: meta.symbol ?? symbol,
        points,
      };
      return history;
    },
  };
}

export function toProviderError(err: unknown): PriceProviderError {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    "message" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return err as PriceProviderError;
  }
  return { code: "TRANSIENT", message: "Unknown market data error", cause: err };
}
