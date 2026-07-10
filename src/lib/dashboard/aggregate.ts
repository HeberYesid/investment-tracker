import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import { calculateTotalEquity } from "@/lib/calculations/equity";
import { calculatePortfolioPnl } from "@/lib/calculations/pnl";
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { aggregateReturns, computeAnnualReturnsFromSeries } from "@/lib/calculations/returns-aggregation";
import { resolveAssetPrice } from "@/lib/calculations/pricing";
import { groupByDimension } from "@/lib/calculations/distribution";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { computeAssetStaleness, loadSnapshot } from "@/lib/dashboard/snapshot";
import { computeTWRFromTrades } from "@/lib/calculations/twr";
import type {
  DistributionDimension,
  DistributionResponse,
  EvolutionGranularity,
  EvolutionResponse,
  ReturnsGroupBy,
  ReturnsResponse,
  SnapshotResponse,
  SummaryResponse,
} from "@/lib/validations/dashboard";

export type DashboardAggregateScope = "full" | "advanced";

export type DashboardAggregate = {
  summary?: SummaryResponse;
  evolution?: EvolutionResponse;
  returns?: ReturnsResponse;
  distribution?: DistributionResponse;
  snapshot: SnapshotResponse;
};

const DEFAULT_GRANULARITY: EvolutionGranularity = "monthly";
const DEFAULT_GROUP_BY: ReturnsGroupBy = "stock";
const DEFAULT_DIMENSION: DistributionDimension = "broker";

export async function loadDashboardAggregate(
  portfolioId: string,
  supabase: SupabaseClient,
  scope: DashboardAggregateScope = "full",
  options?: {
    evolutionGranularity?: EvolutionGranularity;
    evolutionFrom?: string;
    evolutionTo?: string;
    returnsGroupBy?: ReturnsGroupBy;
    distributionDimension?: DistributionDimension;
  },
): Promise<DashboardAggregate> {
  const data = await loadDashboardData(portfolioId, supabase);
  const holdings = aggregateHoldings(data.trades, data.assets, data.brokers);

  const snapshot = await loadSnapshot(data, supabase);

  if (scope === "advanced") {
    return { snapshot };
  }

  const { equityUsd, isAnyEstimated } = calculateTotalEquity(
    holdings,
    data.latestMarketPrices,
  );
  const pnl = calculatePortfolioPnl(holdings, equityUsd);

  const activeAssetIds = Array.from(
    new Set(
      holdings.filter((h) => h.quantity > 0).map((h) => h.assetId),
    ),
  );
  const staleness = computeAssetStaleness(
    activeAssetIds,
    data.latestMarketPrices,
  );
  const isAnyStale = Array.from(staleness.values()).some(
    (value) => value === "stale",
  );
  const staleTickers = Array.from(staleness.entries())
    .filter(([, v]) => v === "stale")
    .map(([id]) => data.assets.find((a) => a.id === id)?.ticker ?? id);

  const twr = computeTWRFromTrades(data.trades, 0, equityUsd);

  const summary: SummaryResponse = {
    equityUsd,
    investedUsd: pnl.investedUsd,
    realizedPnlUsd: pnl.realizedPnlUsd,
    unrealizedPnlUsd: pnl.unrealizedPnlUsd,
    totalPnlUsd: pnl.totalPnlUsd,
    returnPct: pnl.returnPct,
    twr,
    holdingsCount: holdings.filter((h) => h.quantity > 0).length,
    isEstimated: isAnyEstimated,
    isAnyStale,
    staleTickers,
  };

  const historicalPricesByAsset = groupHistoricalPricesByAsset(
    data.historicalPrices,
  );
  const series = buildPortfolioValueSeries(data.trades, {
    granularity: options?.evolutionGranularity ?? DEFAULT_GRANULARITY,
    from: options?.evolutionFrom,
    to: options?.evolutionTo,
    historicalPricesByAsset,
  });
  const evolution: EvolutionResponse = {
    granularity: series.granularity,
    from: series.from,
    to: series.to,
    points: series.points,
    isEstimated: series.isEstimated,
  };

  const equityByHolding = new Map<string, number>();
  const stalenessByHolding = new Map<
    string,
    "fresh" | "stale" | "estimated"
  >();
  for (const holding of holdings) {
    const key = `${holding.assetId}::${holding.brokerId}`;
    if (!equityByHolding.has(key)) {
      const latest = data.latestMarketPrices.find(
        (m) => m.asset_id === holding.assetId,
      );
      const resolved = resolveAssetPrice({
        assetId: holding.assetId,
        latestMarketPrice: latest,
        fallbackTradePriceUsd: holding.averageCost,
      });
      equityByHolding.set(key, resolved.priceUsd * holding.quantity);
    }
    if (!stalenessByHolding.has(key)) {
      const holdingStaleness = staleness.get(holding.assetId) ?? "estimated";
      stalenessByHolding.set(key, holdingStaleness);
    }
  }

  const returnsGroupBy = options?.returnsGroupBy ?? DEFAULT_GROUP_BY;
  const returnsRows =
    returnsGroupBy === "year"
      ? computeAnnualReturnsFromSeries(series.points)
      : aggregateReturns({
          groupBy: returnsGroupBy,
          trades: data.trades,
          holdings,
          equityByHolding,
        });
  const returns: ReturnsResponse = {
    groupBy: options?.returnsGroupBy ?? DEFAULT_GROUP_BY,
    rows: returnsRows,
  };

  const dimension = options?.distributionDimension ?? DEFAULT_DIMENSION;
  const distributionResult = groupByDimension(
    holdings,
    equityByHolding,
    dimension,
    stalenessByHolding,
  );
  const distribution: DistributionResponse = {
    dim: distributionResult.dim,
    totalUsd: distributionResult.totalUsd,
    slices: distributionResult.slices,
    unclassified: distributionResult.unclassified,
  };

  return { summary, evolution, returns, distribution, snapshot };
}

