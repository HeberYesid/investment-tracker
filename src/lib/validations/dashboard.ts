import { z } from "zod";

export const SummaryQuery = z.object({
  portfolio_id: z.string().uuid().optional(),
});

export type SummaryQuery = z.infer<typeof SummaryQuery>;

export const SyncHealthSchema = z.object({
  lastSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  nextRunEstimate: z.iso.datetime().nullable(),
  failedAssetCount: z.number().int().nonnegative(),
  lastFailureReason: z.enum(["MARKET_CLOSED", "UPSTREAM_NULL", "RATE_LIMITED", "NETWORK_ERROR", "PARTIAL_FAILURE", "TOTAL_FAILURE", "NONE"]),
});
export type SyncHealth = z.infer<typeof SyncHealthSchema>;

const DecimalUsd = z.string().regex(/^(?:0|-?(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9]))$/);
const LedgerStatus = z.enum(["complete", "unavailable"]);
const LedgerIssue = z.object({
  code: z.enum(["AMBIGUOUS_DAY_ORDER", "INSUFFICIENT_QUANTITY", "INVALID_TRADE"]),
  tradeDate: z.iso.date().nullable(),
});
export type LedgerIssue = z.infer<typeof LedgerIssue>;
const ledgerFields = { ledgerStatus: LedgerStatus, ledgerIssues: z.array(LedgerIssue).max(10) };
const currentAmounts = {
  investedUsd: DecimalUsd.nullable(), realizedPnlUsd: DecimalUsd.nullable(),
  unrealizedPnlUsd: DecimalUsd.nullable(), totalPnlUsd: DecimalUsd.nullable(), returnPct: z.number().nullable(),
};

export const SummaryResponse = z.object({
  ...ledgerFields,
  ...currentAmounts,
  hasActiveTrades: z.boolean(),
  equityUsd: DecimalUsd.nullable(),
  twr: z.number().nullable(),
  holdingsCount: z.number().nullable(),
  isEstimated: z.boolean(),
  isAnyStale: z.boolean(),
  staleTickers: z.array(z.string()),
  sync: SyncHealthSchema.optional(),
  shouldShowStaleBanner: z.boolean().optional(),
});

export type SummaryResponse = z.infer<typeof SummaryResponse>;

export const DistributionDimension = z.enum(["broker", "sector", "country"]);
export type DistributionDimension = z.infer<typeof DistributionDimension>;

export const DistributionQuery = z.object({
  dim: DistributionDimension.default("broker"),
  portfolio_id: z.string().uuid().optional(),
});

export type DistributionQuery = z.infer<typeof DistributionQuery>;

export const AssetStaleness = z.enum(["fresh", "stale", "estimated"]);
export type AssetStaleness = z.infer<typeof AssetStaleness>;

export const DistributionSlice = z.object({
  key: z.string(),
  label: z.string(),
  valueUsd: DecimalUsd,
  percent: z.number(),
  holdingsCount: z.number(),
  staleness: AssetStaleness,
  source: z.string().optional(),
  observedAt: z.string().optional(),
});

export type DistributionSlice = z.infer<typeof DistributionSlice>;

export const DistributionResponse = z.object({
  ...ledgerFields,
  dim: DistributionDimension,
  totalUsd: DecimalUsd.nullable(),
  slices: z.array(DistributionSlice),
  unclassified: z.boolean(),
});

export type DistributionResponse = z.infer<typeof DistributionResponse>;

export const EvolutionGranularity = z.enum(["daily", "monthly"]);
export type EvolutionGranularity = z.infer<typeof EvolutionGranularity>;

export const EvolutionQuery = z.object({
  granularity: EvolutionGranularity.default("monthly"),
  from: z.string().optional(),
  to: z.string().optional(),
  portfolio_id: z.string().uuid().optional(),
});

export type EvolutionQuery = z.infer<typeof EvolutionQuery>;

export const EvolutionResponse = z.object({
  granularity: EvolutionGranularity,
  from: z.string(),
  to: z.string(),
  points: z.array(
    z.object({
      date: z.string(),
      valueUsd: z.number(),
    }),
  ),
  isEstimated: z.boolean(),
});

export type EvolutionResponse = z.infer<typeof EvolutionResponse>;

export const ReturnsGroupBy = z.enum(["year", "stock", "broker"]);
export type ReturnsGroupBy = z.infer<typeof ReturnsGroupBy>;

export const ReturnsQuery = z.object({
  groupBy: ReturnsGroupBy.default("stock"),
  portfolio_id: z.string().uuid().optional(),
});

export type ReturnsQuery = z.infer<typeof ReturnsQuery>;

export const ReturnsRow = z.object({
  key: z.string(),
  label: z.string(),
  investedUsd: z.number(),
  actualUsd: z.number(),
  realizedPnlUsd: z.number(),
  unrealizedPnlUsd: z.number(),
  totalPnlUsd: z.number(),
  returnPct: z.number(),
});

export type ReturnsRow = z.infer<typeof ReturnsRow>;

const CurrentReturnsRow = z.object({
  ...currentAmounts, key: z.guid(), label: z.string(),
  actualUsd: DecimalUsd.nullable(), ledgerStatus: LedgerStatus,
});
export const ReturnsResponse = z.discriminatedUnion("groupBy", [
  z.object({ ...ledgerFields, groupBy: z.enum(["stock", "broker"]), rows: z.array(CurrentReturnsRow) }),
  z.object({ groupBy: z.literal("year"), rows: z.array(ReturnsRow) }),
]);

export type ReturnsResponse = z.infer<typeof ReturnsResponse>;

export const SnapshotAsset = z.object({
  id: z.string().uuid(),
  ticker: z.string(),
  isEstimated: z.boolean(),
  isStale: z.boolean(),
  observedAt: z.string().nullable(),
  staleness: AssetStaleness,
});

export type SnapshotAsset = z.infer<typeof SnapshotAsset>;

export const BenchmarkPoint = z.object({
  date: z.string(),
  value: z.number(),
});

export type BenchmarkPoint = z.infer<typeof BenchmarkPoint>;

export const BenchmarkSeries = z.object({
  symbol: z.string(),
  label: z.string(),
  normalizedTo: z.number(),
  from: z.string(),
  to: z.string(),
  points: z.array(BenchmarkPoint),
  lastObservedAt: z.string().nullable(),
  isStale: z.boolean(),
});

export type BenchmarkSeries = z.infer<typeof BenchmarkSeries>;

export const SnapshotResponse = z.object({
  assets: z.array(SnapshotAsset),
  isAnyEstimated: z.boolean(),
  isAnyStale: z.boolean(),
  benchmark: BenchmarkSeries.nullable(),
  sync: SyncHealthSchema.optional(),
  shouldShowStaleBanner: z.boolean().optional(),
});

export type SnapshotResponse = z.infer<typeof SnapshotResponse>;
