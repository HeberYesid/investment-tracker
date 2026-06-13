import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetMeta, BrokerMeta, DashboardTrade } from "@/lib/calculations/holdings";
import type { MarketPriceRow } from "@/lib/calculations/pricing";

export type DashboardData = {
  trades: DashboardTrade[];
  assets: AssetMeta[];
  brokers: BrokerMeta[];
  latestMarketPrices: MarketPriceRow[];
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

export async function loadDashboardData(
  portfolioId: string,
  supabase: SupabaseClient,
): Promise<DashboardData> {
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

  const latestMarketPrices: MarketPriceRow[] = [];
  if (assetIds.size > 0) {
    const { data: priceData, error: priceError } = await supabase
      .from("market_prices")
      .select("asset_id, price_usd, observed_at, delayed_until")
      .in("asset_id", Array.from(assetIds))
      .order("observed_at", { ascending: false });

    if (priceError) {
      throw new Error(priceError.message);
    }

    const seen = new Set<string>();
    const nowIso = new Date().toISOString();
    for (const row of (priceData ?? []) as MarketPriceRow[]) {
      if (seen.has(row.asset_id)) continue;
      if (row.delayed_until && row.delayed_until > nowIso) continue;
      seen.add(row.asset_id);
      latestMarketPrices.push({
        asset_id: row.asset_id,
        price_usd: Number(row.price_usd),
        observed_at: row.observed_at,
        delayed_until: row.delayed_until,
      });
    }
  }

  return {
    trades,
    assets: Array.from(assetMap.values()),
    brokers: Array.from(brokerMap.values()),
    latestMarketPrices,
    portfolioId,
  };
}
