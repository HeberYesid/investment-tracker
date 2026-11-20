import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { TradeDTO, TradeListQuery } from "@/lib/validations/trades";
import { serializeTradeDTO } from "@/lib/validations/trades";

export type TradeListResult = {
  data: TradeDTO[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type TradeRow = {
  assets?: { ticker?: string; name?: string } | { ticker?: string; name?: string }[];
  brokers?: { name?: string; code?: string } | { name?: string; code?: string }[];
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function fetchTradesPage(
  supabase: SupabaseClient,
  portfolioId: string,
  params: TradeListQuery,
): Promise<TradeListResult> {
  const {
    page,
    limit,
    ticker,
    broker_id,
    broker_code,
    trade_type,
    currency_original,
    source,
    date_from,
    date_to,
    min_total_usd,
  } = params;

  let resolvedBrokerId = broker_id;
  if (broker_code && !broker_id) {
    const { data: broker } = await supabase
      .from("brokers")
      .select("id")
      .eq("code", broker_code)
      .single();
    if (broker) {
      resolvedBrokerId = broker.id;
    }
  }

  let query = supabase
    .from("trades")
    .select("*, assets(ticker, name), brokers(name, code)", { count: "exact" })
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null)
    .order("trade_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (ticker) {
    query = query.eq("assets.ticker", ticker);
  }
  if (resolvedBrokerId) {
    query = query.eq("broker_id", resolvedBrokerId);
  }
  if (trade_type) {
    query = query.eq("trade_type", trade_type);
  }
  if (currency_original) {
    query = query.eq("currency_original", currency_original);
  }
  if (source) {
    query = query.eq("source", source);
  }
  if (date_from) {
    query = query.gte("trade_date", date_from);
  }
  if (date_to) {
    query = query.lte("trade_date", date_to);
  }
  if (min_total_usd !== undefined && min_total_usd > 0) {
    query = query.or(
      `total_invested_usd.gte.${min_total_usd},total_invested_usd.lte.${-min_total_usd}`,
    );
  }

  const from = (page - 1) * limit;
  const to = page * limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const flattened = (data ?? []).map((row) => {
    const r = row as TradeRow & Record<string, unknown>;
    const assets = firstJoin(r.assets);
    const brokers = firstJoin(r.brokers);
    const { assets: _dropAssets, brokers: _dropBrokers, ...rest } = r;
    void _dropAssets;
    void _dropBrokers;
    return {
      ...rest,
      ticker: assets?.ticker ?? null,
      asset_name: assets?.name ?? null,
      broker_name: brokers?.name ?? null,
      broker_code: brokers?.code ?? null,
    };
  }).map((row) => serializeTradeDTO(row)) as TradeDTO[];

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    data: flattened,
    meta: { page, limit, total, totalPages },
  };
}

/**
 * Internal: queries the latest `created_at` for a portfolio using a
 * service-role Supabase client. The client is created inside the cached
 * callback (never captured from the outer scope) so that Next.js can memoize
 * the result without holding per-request state (cookies) across renders.
 *
 * RLS is bypassed because the result is keyed by `portfolioId`. Callers MUST
 * have already validated that the user has access to that portfolio (e.g. via
 * `getCurrentPortfolio()`) before calling this function.
 */
async function fetchLatestTradeDateRaw(portfolioId: string): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("trades")
    .select("created_at")
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.created_at ?? null;
}

/**
 * Returns the most recent `created_at` (ISO string) for a non-deleted trade
 * in the given portfolio, or `null` when the portfolio has no trades yet.
 *
 * Wrapped with `unstable_cache` (revalidate 30s, tagged `trades` and
 * `trades:<portfolioId>`) so repeated calls within the revalidation window
 * share a single DB round-trip. Trade-insert handlers should invalidate the
 * `trades:<portfolioId>` tag to bust the cache after a write.
 *
 * The `unstable_cache` wrapper is constructed per call so the per-portfolio
 * tag can be derived from the runtime argument — `unstable_cache` evaluates
 * `keyParts` and `options` at construction time, not per invocation. The
 * underlying cache entry is still shared across calls because the key parts
 * include `portfolioId`.
 *
 * Throws when Supabase returns an error (e.g. RLS denies access or the network
 * fails). Callers that want to render a fallback should catch and degrade
 * gracefully.
 */
export async function fetchLatestTradeDate(
  portfolioId: string,
): Promise<string | null> {
  "use cache";
  cacheTag("trades", `trades:${portfolioId}`);
  cacheLife({ revalidate: 30 });
  return fetchLatestTradeDateRaw(portfolioId);
}

// Compile-time hint for tests / consumers that want the underlying fn without
// the cache wrapper.
export const __fetchLatestTradeDateRaw = fetchLatestTradeDateRaw;
