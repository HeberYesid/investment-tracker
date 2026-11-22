import {
  type AssetProfile,
  type AssetProfileCandidateResult,
  type AssetProfileProvider,
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
import { logger } from "@/lib/logger";
import { acquireYahooSession } from "./yahoo-session";

const CHART_PATH = "/v8/finance/chart/";
const PROFILE_PATH = "/v10/finance/quoteSummary/";

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

export function createYahooProvider(
  opts: YahooProviderOptions = {},
): PriceProvider & AssetProfileProvider {
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

  function normalizeProfileField(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async function fetchProfileRaw(
    symbol: string,
    useSession: boolean = true,
  ): Promise<{ kind: "ok"; profile: AssetProfile } | { kind: "empty" } | { kind: "error"; message: string }> {
    const session = useSession ? await acquireYahooSession(fetchImpl) : null;
    const url = new URL(
      `${env.yahooBaseUrl}${PROFILE_PATH}${encodeURIComponent(symbol)}`,
    );
    url.searchParams.set("modules", "summaryProfile");
    if (session) url.searchParams.set("crumb", session.crumb);

    const headers: Record<string, string> = {
      "User-Agent": env.userAgent,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://finance.yahoo.com",
      Referer: "https://finance.yahoo.com/",
    };
    if (session) headers.Cookie = session.cookie;

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(url.toString(), {
        headers,
        signal: AbortSignal.timeout(env.requestTimeoutMs),
      });
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "fetch failed",
      };
    }

    if (response.status === 401 && useSession) {
      logger.warn(
        "yahoo",
        `${symbol} returned 401 with session, retrying without…`,
      );
      return fetchProfileRaw(symbol, false);
    }

    if (response.status === 429) {
      return { kind: "error", message: "rate_limited" };
    }
    if (response.status === 404) {
      return { kind: "empty" };
    }
    if (!response.ok) {
      return { kind: "error", message: `http_${response.status}` };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: "error", message: "invalid_json" };
    }

    const summary = (
      body as {
        quoteSummary?: {
          result?: Array<{
            summaryProfile?: {
              sector?: unknown;
              country?: unknown;
            };
          }>;
          error?: unknown;
        };
      }
    )?.quoteSummary;

    if (!summary) {
      return { kind: "error", message: "no_quote_summary" };
    }
    if (summary.error) {
      return { kind: "empty" };
    }
    const profile = summary.result?.[0]?.summaryProfile;
    if (!profile) {
      return { kind: "empty" };
    }

    const sector = normalizeProfileField(profile.sector);
    const country = normalizeProfileField(profile.country);
    if (!sector && !country) {
      return { kind: "empty" };
    }
    return { kind: "ok", profile: { sector, country } };
  }

  async function fetchProfile(symbol: string): Promise<AssetProfile | null> {
    const result = await fetchProfileRaw(symbol);
    return result.kind === "ok" ? result.profile : null;
  }

  async function fetchProfileWithCandidates(
    candidates: string[],
  ): Promise<AssetProfileCandidateResult> {
    let lastError = "";
    for (const symbol of candidates) {
      const result = await fetchProfileRaw(symbol);
      if (result.kind === "ok") {
        return { status: "ok", profile: result.profile, resolvedSymbol: symbol };
      }
      if (result.kind === "empty") continue;
      lastError = result.message;
    }
    if (lastError) {
      return { status: "error", message: lastError };
    }
    return { status: "not_found" };
  }

  async function fetchQuote(symbol: string): Promise<FetchedQuote> {
    const result = await fetchChart(symbol, { range: "1d", interval: "1d" });
    const { price, observedAt } = pickQuotePrice(result);
    return { symbol, priceUsd: price, currency: result.meta?.currency ?? "USD", observedAt, delayedUntil: null };
  }

  return {
    fetchQuote,
    async fetchQuotes(symbols) {
      const results = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            return { ok: true as const, value: await fetchQuote(symbol) };
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

    fetchProfile,
    fetchProfileWithCandidates,
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
