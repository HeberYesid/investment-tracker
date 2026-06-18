// supabase/functions/_shared/yahoo.ts
//
// Small Deno-compatible wrapper around Yahoo Finance's unofficial
// /v8/finance/chart endpoint. Returns the latest regular-market price
// for a single symbol. The Deno runtime provides a global `fetch`,
// matching the Node 20+ behaviour the Next.js side relies on.

const DEFAULT_BASE_URL = "https://query1.finance.yahoo.com";
const DEFAULT_USER_AGENT = "investment-tracker/0.1 (market-data-sync)";

export type FetchedQuote = {
  symbol: string;
  priceUsd: number;
  currency: string;
  observedAt: string;
  delayedUntil: string | null;
};

export type YahooProviderErrorCode = "TRANSIENT" | "PERMANENT" | "RATE_LIMITED" | "NOT_FOUND";

export type YahooProviderError = {
  code: YahooProviderErrorCode;
  message: string;
};

export type YahooProviderResult =
  | { ok: true; value: FetchedQuote }
  | { ok: false; error: YahooProviderError };

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number | null;
        delayedPrice?: number | null;
        previousClose?: number | null;
        currency?: string;
        regularMarketTime?: number;
      };
      indicators?: {
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

export function getYahooBaseUrl(): string {
  return Deno.env.get("MARKET_DATA_YAHOO_BASE_URL") ?? DEFAULT_BASE_URL;
}

export function getUserAgent(): string {
  return Deno.env.get("MARKET_DATA_USER_AGENT") ?? DEFAULT_USER_AGENT;
}

export function parseChartResponse(symbol: string, json: unknown): YahooProviderResult {
  const data = json as ChartResponse | null;
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) {
    return { ok: false, error: { code: "PERMANENT", message: "Yahoo: no meta in chart response" } };
  }
  const price =
    typeof meta.regularMarketPrice === "number" && Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : typeof meta.delayedPrice === "number" && Number.isFinite(meta.delayedPrice)
        ? meta.delayedPrice
        : typeof meta.previousClose === "number" && Number.isFinite(meta.previousClose)
          ? meta.previousClose
          : null;
  if (price === null || price <= 0) {
    return {
      ok: false,
      error: { code: "PERMANENT", message: "Yahoo: no usable price in chart response" },
    };
  }
  const observedAt = typeof meta.regularMarketTime === "number"
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();
  return {
    ok: true,
    value: {
      symbol: meta.symbol ?? symbol,
      priceUsd: price,
      currency: meta.currency ?? "USD",
      observedAt,
      delayedUntil: null,
    },
  };
}

export async function fetchYahooQuote(symbol: string): Promise<YahooProviderResult> {
  const url = `${getYahooBaseUrl()}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": getUserAgent(),
      Accept: "application/json",
    },
  });
  if (response.status === 404) {
    return { ok: false, error: { code: "NOT_FOUND", message: `Yahoo: 404 for ${symbol}` } };
  }
  if (response.status === 429) {
    return { ok: false, error: { code: "RATE_LIMITED", message: `Yahoo: 429 for ${symbol}` } };
  }
  if (response.status >= 500) {
    return { ok: false, error: { code: "TRANSIENT", message: `Yahoo: ${response.status} for ${symbol}` } };
  }
  if (!response.ok) {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: ${response.status} for ${symbol}` } };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: invalid JSON for ${symbol}` } };
  }
  return parseChartResponse(symbol, json);
}

export type YahooHistoryPoint = {
  observedAt: string;
  priceUsd: number;
};

export type YahooHistoryResult =
  | { ok: true; value: YahooHistoryPoint[] }
  | { ok: false; error: YahooProviderError };

type ChartHistoryResponse = {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string };
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
};

export function parseChartHistoryResponse(symbol: string, json: unknown): YahooHistoryResult {
  const data = json as ChartHistoryResponse | null;
  const result = data?.chart?.result?.[0];
  if (!result) {
    return { ok: false, error: { code: "PERMANENT", message: "Yahoo: no result in chart history response" } };
  }
  const timestamps = result.timestamp ?? [];
  const adjclose = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (timestamps.length === 0 || adjclose.length !== timestamps.length) {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: missing history series for ${symbol}` } };
  }
  const points: YahooHistoryPoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = timestamps[i];
    const value = adjclose[i];
    if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    points.push({
      observedAt: new Date(ts * 1000).toISOString(),
      priceUsd: value,
    });
  }
  if (points.length === 0) {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: no numeric history points for ${symbol}` } };
  }
  return { ok: true, value: points };
}

export async function fetchYahooHistory(
  symbol: string,
  range: string = "2y",
  interval: string = "1d",
): Promise<YahooHistoryResult> {
  const url =
    `${getYahooBaseUrl()}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": getUserAgent(),
      Accept: "application/json",
    },
  });
  if (response.status === 404) {
    return { ok: false, error: { code: "NOT_FOUND", message: `Yahoo: 404 for ${symbol}` } };
  }
  if (response.status === 429) {
    return { ok: false, error: { code: "RATE_LIMITED", message: `Yahoo: 429 for ${symbol}` } };
  }
  if (response.status >= 500) {
    return { ok: false, error: { code: "TRANSIENT", message: `Yahoo: ${response.status} for ${symbol}` } };
  }
  if (!response.ok) {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: ${response.status} for ${symbol}` } };
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, error: { code: "PERMANENT", message: `Yahoo: invalid JSON for ${symbol}` } };
  }
  return parseChartHistoryResponse(symbol, json);
}
