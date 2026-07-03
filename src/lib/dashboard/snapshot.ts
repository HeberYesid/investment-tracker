import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import { isHistoryStale, isQuoteStale } from "@/lib/market-data/config";
import { STALE_HISTORY_MS } from "@/lib/market-data/types";
import type { MarketPriceRow } from "@/lib/calculations/pricing";
import type { DashboardData } from "@/lib/dashboard/loader";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export const BENCHMARK_TICKER = "^GSPC";
export const BENCHMARK_LABEL = "S&P 500";
export const BENCHMARK_HISTORY_LIMIT = 520;
export const BENCHMARK_INTRADAY_LIMIT = 1500;

export type AssetStalenessValue = "fresh" | "stale" | "estimated";

export type SnapshotAsset = {
  id: string;
  ticker: string;
  isEstimated: boolean;
  isStale: boolean;
  observedAt: string | null;
  staleness: AssetStalenessValue;
};

export type BenchmarkPoint = {
  date: string;
  value: number;
};

export type BenchmarkSeries = {
  symbol: string;
  label: string;
  normalizedTo: number;
  from: string;
  to: string;
  points: BenchmarkPoint[];
  lastObservedAt: string | null;
  isStale: boolean;
};

export type SnapshotResult = {
  assets: SnapshotAsset[];
  isAnyEstimated: boolean;
  isAnyStale: boolean;
  benchmark: BenchmarkSeries | null;
};

export function computeAssetStaleness(
  assetIds: string[],
  latestMarketPrices: MarketPriceRow[],
  now: Date = new Date(),
): Map<string, AssetStalenessValue> {
  const result = new Map<string, AssetStalenessValue>();
  const latestByAsset = new Map<string, MarketPriceRow>();
  for (const row of latestMarketPrices) {
    if (!latestByAsset.has(row.asset_id)) {
      latestByAsset.set(row.asset_id, row);
    }
  }
  for (const id of assetIds) {
    const row = latestByAsset.get(id);
    if (!row) {
      result.set(id, "estimated");
    } else if (isQuoteStale(row.observed_at, now)) {
      result.set(id, "stale");
    } else {
      result.set(id, "fresh");
    }
  }
  return result;
}

export function buildSnapshotAssets(
  dashboardData: DashboardData,
  staleness: Map<string, AssetStalenessValue>,
): SnapshotAsset[] {
  const observedAtByAsset = new Map<string, string>();
  for (const row of dashboardData.latestMarketPrices) {
    if (!observedAtByAsset.has(row.asset_id)) {
      observedAtByAsset.set(row.asset_id, row.observed_at);
    }
  }
  const sorted = [...dashboardData.assets].sort((a, b) =>
    a.ticker.localeCompare(b.ticker),
  );
  return sorted.map((asset) => {
    const value = staleness.get(asset.id) ?? "estimated";
    const observedAt = observedAtByAsset.get(asset.id) ?? null;
    const isStale = value === "stale";
    const isEstimated = value === "estimated";
    if (value === "fresh") {
      // observedAt is guaranteed present for fresh quotes
    }
    return {
      id: asset.id,
      ticker: asset.ticker,
      isEstimated,
      isStale,
      observedAt,
      staleness: value,
    };
  });
}

export function buildBenchmarkSeries(
  prices: Array<{ observed_at: string; price_usd: number }>,
  now: Date = new Date(),
  staleMs: number = STALE_HISTORY_MS,
): BenchmarkSeries | null {
  if (prices.length < 2) return null;
  const sorted = [...prices].sort((a, b) =>
    a.observed_at < b.observed_at ? -1 : 1,
  );
  const firstPrice = Number(sorted[0].price_usd);
  if (!Number.isFinite(firstPrice) || firstPrice <= 0) return null;
  const points: BenchmarkPoint[] = sorted.map((row) => ({
    date: row.observed_at,
    value: (Number(row.price_usd) / firstPrice) * 100,
  }));
  const last = sorted[sorted.length - 1];
  return {
    symbol: BENCHMARK_TICKER,
    label: BENCHMARK_LABEL,
    normalizedTo: 100,
    from: sorted[0].observed_at,
    to: last.observed_at,
    points,
    lastObservedAt: last.observed_at,
    isStale: isHistoryStale(last.observed_at, now, staleMs),
  };
}

type BenchmarkRow = {
  observed_at: string;
  price_usd: number;
};

export function dedupBenchmarkRowsPerUtcDay(rows: BenchmarkRow[]): BenchmarkRow[] {
  const seen = new Map<string, BenchmarkRow>();
  const sortedDesc = [...rows].sort((a, b) =>
    a.observed_at < b.observed_at ? 1 : -1,
  );
  for (const row of sortedDesc) {
    const day = row.observed_at.slice(0, 10);
    if (!seen.has(day)) {
      seen.set(day, row);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.observed_at < b.observed_at ? -1 : 1,
  );
}

type BenchmarkRawData = {
  rows: BenchmarkRow[];
};

async function fetchBenchmarkRawDataInner(): Promise<BenchmarkRawData> {
  const supabase = createServiceSupabaseClient();
  const { data: benchmarkAsset, error: assetError } = await supabase
    .from("assets")
    .select("id, ticker, yahoo_symbol")
    .or(`ticker.eq.${BENCHMARK_TICKER},yahoo_symbol.eq.${BENCHMARK_TICKER}`)
    .limit(1)
    .maybeSingle();

  if (assetError) {
    throw new Error(assetError.message);
  }
  if (!benchmarkAsset) return { rows: [] };

  const assetId = (benchmarkAsset as { id: string }).id;

  const [historyResult, intradayResult] = await Promise.all([
    supabase
      .from("market_prices")
      .select("observed_at, price_usd")
      .eq("asset_id", assetId)
      .eq("source", "BENCHMARK_HISTORY")
      .order("observed_at", { ascending: false })
      .limit(BENCHMARK_HISTORY_LIMIT),
    supabase
      .from("market_prices")
      .select("observed_at, price_usd")
      .eq("asset_id", assetId)
      .eq("source", "BENCHMARK")
      .order("observed_at", { ascending: false })
      .limit(BENCHMARK_INTRADAY_LIMIT),
  ]);

  if (historyResult.error) {
    throw new Error(historyResult.error.message);
  }
  if (intradayResult.error) {
    throw new Error(intradayResult.error.message);
  }

  const merged = dedupBenchmarkRowsPerUtcDay([
    ...((historyResult.data ?? []) as BenchmarkRow[]),
    ...((intradayResult.data ?? []) as BenchmarkRow[]),
  ]);

  return { rows: merged };
}

async function fetchBenchmarkRawData(): Promise<BenchmarkRawData> {
  "use cache";
  cacheTag("benchmark");
  cacheLife({ revalidate: 60 });
  return fetchBenchmarkRawDataInner();
}

export async function loadBenchmarkSeries(
  _supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<BenchmarkSeries | null> {
  const { rows } = await fetchBenchmarkRawData();
  return buildBenchmarkSeries(rows, now, STALE_HISTORY_MS);
}

export async function loadSnapshot(
  dashboardData: DashboardData,
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<SnapshotResult> {
  const holdings = aggregateHoldings(
    dashboardData.trades,
    dashboardData.assets,
    dashboardData.brokers,
  );
  const activeAssetIds = Array.from(
    new Set(
      holdings
        .filter((h) => h.quantity > 0)
        .map((h) => h.assetId),
    ),
  );
  const staleness = computeAssetStaleness(
    activeAssetIds,
    dashboardData.latestMarketPrices,
    now,
  );
  const assets = buildSnapshotAssets(dashboardData, staleness);
  const isAnyEstimated = assets.some((a) => a.isEstimated);
  const isAnyStale = assets.some((a) => a.isStale);
  const benchmark = await loadBenchmarkSeries(supabase, now);
  return { assets, isAnyEstimated, isAnyStale, benchmark };
}
