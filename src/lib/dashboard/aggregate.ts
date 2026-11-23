import type { SupabaseClient } from "@supabase/supabase-js";

import { aggregateCurrentReturns, projectDistribution, projectSummary } from "@/lib/calculations/current-valuation";
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { computeAnnualReturnsFromSeries } from "@/lib/calculations/returns-aggregation";
import { buildDashboardValuation } from "@/lib/dashboard/current";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { loadMonthlyPortfolioSummary } from "@/lib/dashboard/monthly-summary";
import type { MonthlySummaryResult } from "@/lib/dashboard/monthly-summary-types";
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

type DashboardAggregateOptions = {
  evolutionGranularity?: EvolutionGranularity;
  evolutionFrom?: string;
  evolutionTo?: string;
  returnsGroupBy?: ReturnsGroupBy;
  distributionDimension?: DistributionDimension;
};

type MonthlyDashboardAggregate = DashboardAggregate & { monthlySummary: MonthlySummaryResult };

const DEFAULT_GRANULARITY: EvolutionGranularity = "monthly";
const DEFAULT_GROUP_BY: ReturnsGroupBy = "stock";
const DEFAULT_DIMENSION: DistributionDimension = "broker";

export function loadDashboardAggregate(
  portfolioId: string,
  supabase: SupabaseClient,
  scope: "full",
  options: DashboardAggregateOptions & { includeMonthlySummary: true },
): Promise<MonthlyDashboardAggregate>;
export function loadDashboardAggregate(
  portfolioId: string,
  supabase: SupabaseClient,
  scope?: DashboardAggregateScope,
  options?: DashboardAggregateOptions & { includeMonthlySummary?: never },
): Promise<DashboardAggregate>;
export async function loadDashboardAggregate(
  portfolioId: string,
  supabase: SupabaseClient,
  scope: DashboardAggregateScope = "full",
  options?: DashboardAggregateOptions & { includeMonthlySummary?: true },
): Promise<DashboardAggregate | MonthlyDashboardAggregate> {
  const includeMonthlySummary = scope === "full" && options?.includeMonthlySummary === true;
  const data = includeMonthlySummary
    ? await loadDashboardData(portfolioId, supabase, true)
    : await loadDashboardData(portfolioId, supabase);
  const now = new Date();
  const [snapshot, monthlySummary] = await Promise.all([
    loadSnapshot(data, supabase, now),
    includeMonthlySummary
      ? loadMonthlyPortfolioSummary(data, supabase, now)
      : undefined,
  ]);

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

  const base = { summary, evolution, returns, distribution, snapshot };
  return monthlySummary ? { ...base, monthlySummary } : base;
}

