import {
  STALE_FX_MS,
  STALE_HISTORY_MS,
  STALE_PRICE_MS,
  type YahooRange,
} from "./types";

export type MarketDataEnv = {
  yahooBaseUrl: string;
  stooqBaseUrl?: string;
  fxBaseUrl: string;
  userAgent: string;
  requestTimeoutMs: number;
  stalePriceMs: number;
  staleFxMs: number;
  staleHistoryMs: number;
};

const DEFAULT_YAHOO_BASE_URL = "https://query2.finance.yahoo.com";
const DEFAULT_FX_BASE_URL = "https://open.er-api.com/v6/latest";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export function getMarketDataEnv(
  overrides: Partial<MarketDataEnv> = {},
): MarketDataEnv {
  return {
    yahooBaseUrl: process.env.MARKET_DATA_YAHOO_BASE_URL ?? DEFAULT_YAHOO_BASE_URL,
    stooqBaseUrl: overrides.stooqBaseUrl ?? process.env.STOOQ_BASE_URL ?? "https://stooq.com",
    fxBaseUrl: process.env.MARKET_DATA_FX_BASE_URL ?? DEFAULT_FX_BASE_URL,
    userAgent:
      process.env.MARKET_DATA_USER_AGENT ?? DEFAULT_USER_AGENT,
    requestTimeoutMs: parsePositiveInt(
      process.env.MARKET_DATA_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
    stalePriceMs: overrides.stalePriceMs ?? STALE_PRICE_MS,
    staleFxMs: overrides.staleFxMs ?? STALE_FX_MS,
    staleHistoryMs: overrides.staleHistoryMs ?? STALE_HISTORY_MS,
  };
}

export function isQuoteStale(
  observedAt: string,
  now: Date = new Date(),
  staleMs: number = STALE_PRICE_MS,
): boolean {
  const observed = new Date(observedAt).getTime();
  if (Number.isNaN(observed)) return true;
  return now.getTime() - observed > staleMs;
}

export function isFxStale(
  observedAt: string,
  now: Date = new Date(),
  staleMs: number = STALE_FX_MS,
): boolean {
  return isQuoteStale(observedAt, now, staleMs);
}

export function isHistoryStale(
  lastPointAt: string,
  now: Date = new Date(),
  staleMs: number = STALE_HISTORY_MS,
): boolean {
  return isQuoteStale(lastPointAt, now, staleMs);
}

export function normalizeRangeParam(raw: string | null | undefined): YahooRange {
  if (!raw) return "1y";
  const lower = raw.toLowerCase();
  if (
    lower === "1mo" ||
    lower === "3mo" ||
    lower === "6mo" ||
    lower === "1y" ||
    lower === "2y" ||
    lower === "5y" ||
    lower === "10y" ||
    lower === "ytd" ||
    lower === "max"
  ) {
    return lower;
  }
  return "1y";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
