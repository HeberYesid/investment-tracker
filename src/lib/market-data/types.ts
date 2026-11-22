export type FetchLike = (
  input: string | URL,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
    getSetCookie?: () => string[];
  };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export type FetchedQuote = {
  symbol: string;
  priceUsd: number;
  currency: string;
  observedAt: string;
  delayedUntil: string | null;
  source?: "YAHOO" | "STOOQ";
};

export type FetchedHistoryPoint = {
  date: string;
  value: number;
};

export type FetchedHistory = {
  symbol: string;
  points: FetchedHistoryPoint[];
};

export type PriceProviderError = {
  code: "TRANSIENT" | "PERMANENT" | "RATE_LIMITED" | "NOT_FOUND" | "INVALID_PAYLOAD";
  message: string;
  cause?: unknown;
};

export type PriceProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PriceProviderError };

export type PriceProvider = {
  fetchQuote?(symbol: string): Promise<FetchedQuote>;
  fetchQuotes(symbols: string[]): Promise<FetchedQuote[]>;
  fetchHistory(symbol: string, range: YahooRange): Promise<FetchedHistory>;
};

export type AssetProfile = {
  sector: string | null;
  country: string | null;
};

export type AssetProfileCandidateResult =
  | { status: "ok"; profile: AssetProfile; resolvedSymbol: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

export type AssetProfileProvider = {
  fetchProfile(symbol: string): Promise<AssetProfile | null>;
  fetchProfileWithCandidates(
    candidates: string[],
  ): Promise<AssetProfileCandidateResult>;
};

export const SUPPORTED_FX_CURRENCIES = ["USD", "COP"] as const;
export type FxCurrency = (typeof SUPPORTED_FX_CURRENCIES)[number];

export type FetchedFxRate = {
  fromCurrency: FxCurrency;
  toCurrency: FxCurrency;
  rate: number;
  observedAt: string;
};

export type FxRateProvider = {
  fetchLatestRates(): Promise<FetchedFxRate[]>;
};

export const YAHOO_RANGES = [
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
] as const;

export type YahooRange = (typeof YAHOO_RANGES)[number];

export const YAHOO_INTERVAL_BY_RANGE: Record<YahooRange, "1d" | "1wk" | "1mo"> =
  {
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1d",
    "1y": "1d",
    "2y": "1d",
    "5y": "1wk",
    "10y": "1wk",
    ytd: "1d",
    max: "1mo",
  };

export const STALE_PRICE_MS = 2 * 60 * 60 * 1000;
export const STALE_FX_MS = 24 * 60 * 60 * 1000;
export const STALE_HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

export type YahooSymbolSource = "yahoo_symbol" | "ticker";

export function isYahooRange(value: string): value is YahooRange {
  return (YAHOO_RANGES as readonly string[]).includes(value);
}
