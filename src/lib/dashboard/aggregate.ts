import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateCurrentReturns, projectDistribution, projectSummary } from "@/lib/calculations/current-valuation";
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { computeAnnualReturnsFromSeries } from "@/lib/calculations/returns-aggregation";
import { buildDashboardValuation } from "@/lib/dashboard/current";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { loadSnapshot } from "@/lib/dashboard/snapshot";
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
  const now = new Date();
  const snapshot = await loadSnapshot(data, supabase, now);

  if (scope === "advanced") {
    return { snapshot };
  }

  const valued = buildDashboardValuation(data, now);
  const current = projectSummary(valued);
  const twr = current.equityUsd === null ? null : computeTWRFromTrades(data.trades, 0, Number(current.equityUsd));

  const summary: SummaryResponse = {
    ...current,
    twr,
    ...(snapshot.sync ? { sync: snapshot.sync } : {}),
    ...(snapshot.shouldShowStaleBanner !== undefined ? { shouldShowStaleBanner: snapshot.shouldShowStaleBanner } : {}),
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

  const returnsGroupBy = options?.returnsGroupBy ?? DEFAULT_GROUP_BY;
  const returns: ReturnsResponse =
    returnsGroupBy === "year"
      ? { groupBy: "year", rows: computeAnnualReturnsFromSeries(series.points) }
      : aggregateCurrentReturns(valued, returnsGroupBy);

  const dimension = options?.distributionDimension ?? DEFAULT_DIMENSION;
  const distribution: DistributionResponse = projectDistribution(valued, dimension);

  return { summary, evolution, returns, distribution, snapshot };
}

