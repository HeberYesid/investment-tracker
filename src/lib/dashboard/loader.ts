import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetMeta, BrokerMeta, DashboardTrade } from "@/lib/calculations/holdings";
import type { MarketPriceRow } from "@/lib/calculations/pricing";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type HistoricalPriceRow = {
  asset_id: string;
  price_usd: number;
  observed_at: string;
};

export type DashboardData = {
  trades: DashboardTrade[];
  assets: AssetMeta[];
  brokers: BrokerMeta[];
  latestMarketPrices: MarketPriceRow[];
  historicalPrices: HistoricalPriceRow[];
  portfolioId: string;
};

type TradeRow = {
  asset_id: string;
  broker_id: string;
  trade_type: DashboardTrade["trade_type"];
  trade_date: string;
  quantity: number;
  price_usd: number;
  commission_usd: number;
  total_invested_usd: number;
  deleted_at: string | null;
  assets:
    | { ticker: string; name: string | null; sector: string | null; country: string | null }
    | Array<{ ticker: string; name: string | null; sector: string | null; country: string | null }>
    | null;
  brokers:
    | { code: string; name: string }
    | Array<{ code: string; name: string }>
    | null;
};

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

const loadTradesAndAssets = async (
  portfolioId: string,
  supabase: SupabaseClient,
): Promise<{
  trades: DashboardTrade[];
  assets: AssetMeta[];
  brokers: BrokerMeta[];
  assetIds: string[];
}> => {
  const { data: tradesData, error: tradesError } = await supabase
    .from("trades")
    .select(
      "asset_id, broker_id, trade_type, trade_date, quantity, price_usd, commission_usd, total_invested_usd, deleted_at, assets(ticker, name, sector, country), brokers(code, name)",
    )
    .eq("portfolio_id", portfolioId)
    .is("deleted_at", null);

  if (tradesError) {
    throw new Error(tradesError.message);
  }

  const rows = (tradesData ?? []) as unknown as TradeRow[];

  const trades: DashboardTrade[] = rows.map((row) => ({
    asset_id: row.asset_id,
    broker_id: row.broker_id,
    trade_type: row.trade_type,
    trade_date: row.trade_date,
    quantity: Number(row.quantity),
    price_usd: Number(row.price_usd),
    commission_usd: Number(row.commission_usd),
    total_invested_usd: Number(row.total_invested_usd),
    deleted_at: row.deleted_at,
  }));

  const assetMap = new Map<string, AssetMeta>();
  const brokerMap = new Map<string, BrokerMeta>();
  const assetIds = new Set<string>();

  for (const row of rows) {
    assetIds.add(row.asset_id);
    const asset = firstJoin(row.assets);
    if (asset && !assetMap.has(row.asset_id)) {
      assetMap.set(row.asset_id, {
        id: row.asset_id,
        ticker: asset.ticker,
        name: asset.name,
        sector: asset.sector,
        country: asset.country,
      });
    }
    const broker = firstJoin(row.brokers);
    if (broker && !brokerMap.has(row.broker_id)) {
      brokerMap.set(row.broker_id, {
        id: row.broker_id,
        code: broker.code,
        name: broker.name,
      });
    }
  }

  return {
    trades,
    assets: Array.from(assetMap.values()),
    brokers: Array.from(brokerMap.values()),
    assetIds: Array.from(assetIds),
  };
};

const fetchLatestMarketPrices = unstable_cache(
  async (assetIds: string[]): Promise<MarketPriceRow[]> => {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase.rpc("get_latest_market_prices", {
      p_asset_ids: assetIds,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as MarketPriceRow[]).map((row) => ({
      asset_id: row.asset_id,
      price_usd: Number(row.price_usd),
      observed_at: row.observed_at,
      delayed_until: row.delayed_until,
    }));
  },
  ["market-prices"],
  { revalidate: 60, tags: ["market-prices"] },
);

const loadLatestMarketPrices = async (
  assetIds: string[],
  _supabase: SupabaseClient,
): Promise<MarketPriceRow[]> => {
  if (assetIds.length === 0) return [];
  return fetchLatestMarketPrices(assetIds);
};

const fetchHistoricalPrices = unstable_cache(
  async (
    assetIds: string[],
    from: string,
    to: string,
  ): Promise<HistoricalPriceRow[]> => {
    if (assetIds.length === 0) return [];
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("market_prices")
      .select("asset_id, price_usd, observed_at")
      .in("asset_id", assetIds)
      .eq("source", "PRICE_HISTORY")
      .gte("observed_at", from)
      .lte("observed_at", to)
      .order("observed_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{
      asset_id: string;
      price_usd: number | string;
      observed_at: string;
    }>).map((row) => ({
      asset_id: row.asset_id,
      price_usd: Number(row.price_usd),
      observed_at: row.observed_at,
    }));
  },
  ["asset-prices-history"],
  { revalidate: 60, tags: ["asset-prices-history"] },
);

const loadHistoricalPrices = async (
  assetIds: string[],
  from: string,
  to: string,
  _supabase: SupabaseClient,
): Promise<HistoricalPriceRow[]> => {
  if (assetIds.length === 0) return [];
  return fetchHistoricalPrices(assetIds, from, to);
};

export function groupHistoricalPricesByAsset(
  rows: HistoricalPriceRow[],
): Map<string, Array<{ observedAt: string; priceUsd: number }>> {
  const grouped = new Map<
    string,
    Array<{ observedAt: string; priceUsd: number }>
  >();
  for (const row of rows) {
    const list = grouped.get(row.asset_id) ?? [];
    list.push({ observedAt: row.observed_at, priceUsd: row.price_usd });
    grouped.set(row.asset_id, list);
  }
  return grouped;
}

export const loadDashboardData = cache(
  async (
    portfolioId: string,
    supabase: SupabaseClient,
  ): Promise<DashboardData> => {
    const { trades, assets, brokers, assetIds } = await loadTradesAndAssets(
      portfolioId,
      supabase,
    );
    const latestMarketPrices = await loadLatestMarketPrices(assetIds, supabase);
    const firstTradeDate = trades.reduce<string | null>((acc, trade) => {
      if (!acc || trade.trade_date < acc) return trade.trade_date;
      return acc;
    }, null);
    const today = new Date().toISOString().slice(0, 10);
    const historicalPrices = firstTradeDate
      ? await loadHistoricalPrices(
          assetIds,
          firstTradeDate,
          `${today}T23:59:59.999Z`,
          supabase,
        )
      : [];
    return {
      trades,
      assets,
      brokers,
      latestMarketPrices,
      historicalPrices,
      portfolioId,
    };
  },
);
