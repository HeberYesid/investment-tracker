import { z } from "zod";

export const SummaryQuery = z.object({
  portfolio_id: z.string().uuid().optional(),
});

export type SummaryQuery = z.infer<typeof SummaryQuery>;

export const SummaryResponse = z.object({
  equityUsd: z.number(),
  investedUsd: z.number(),
  realizedPnlUsd: z.number(),
  unrealizedPnlUsd: z.number(),
  totalPnlUsd: z.number(),
  returnPct: z.number(),
  holdingsCount: z.number(),
  isEstimated: z.boolean(),
});

export type SummaryResponse = z.infer<typeof SummaryResponse>;

export const DistributionDimension = z.enum(["broker", "sector", "country"]);
export type DistributionDimension = z.infer<typeof DistributionDimension>;

export const DistributionQuery = z.object({
  dim: DistributionDimension.default("broker"),
  portfolio_id: z.string().uuid().optional(),
});

export type DistributionQuery = z.infer<typeof DistributionQuery>;

export const DistributionSlice = z.object({
  key: z.string(),
  label: z.string(),
  valueUsd: z.number(),
  percent: z.number(),
  holdingsCount: z.number(),
});

export type DistributionSlice = z.infer<typeof DistributionSlice>;

export const DistributionResponse = z.object({
  dim: DistributionDimension,
  totalUsd: z.number(),
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
});

export type EvolutionResponse = z.infer<typeof EvolutionResponse>;

export const ReturnsGroupBy = z.enum(["month", "year", "stock", "broker"]);
export type ReturnsGroupBy = z.infer<typeof ReturnsGroupBy>;

export const ReturnsQuery = z.object({
  groupBy: ReturnsGroupBy.default("month"),
  portfolio_id: z.string().uuid().optional(),
});

export type ReturnsQuery = z.infer<typeof ReturnsQuery>;

export const ReturnsRow = z.object({
  key: z.string(),
  label: z.string(),
  realizedPnlUsd: z.number(),
  unrealizedPnlUsd: z.number(),
  totalPnlUsd: z.number(),
  returnPct: z.number(),
});

export type ReturnsRow = z.infer<typeof ReturnsRow>;

export const ReturnsResponse = z.object({
  groupBy: ReturnsGroupBy,
  rows: z.array(ReturnsRow),
});

export type ReturnsResponse = z.infer<typeof ReturnsResponse>;

export const DrawdownResponse = z.object({
  series: z.array(
    z.object({
      date: z.string(),
      valueUsd: z.number(),
      peakUsd: z.number(),
      drawdownPct: z.number(),
    }),
  ),
  maxDrawdownPct: z.number(),
});

export type DrawdownResponse = z.infer<typeof DrawdownResponse>;
