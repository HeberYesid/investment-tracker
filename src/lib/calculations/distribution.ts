import type { Holding } from "./holdings";
import type { AssetStalenessValue } from "@/lib/dashboard/snapshot";
import {
  UNCLASSIFIED,
  translateCountry,
  translateSector,
} from "@/lib/i18n/asset-metadata";

export type DistributionDimension = "broker" | "sector" | "country";

export type DistributionSlice = {
  key: string;
  label: string;
  valueUsd: number;
  percent: number;
  holdingsCount: number;
  staleness: AssetStalenessValue;
  source?: string;
  observedAt?: string;
};

export type DistributionResult = {
  dim: DistributionDimension;
  totalUsd: number;
  slices: DistributionSlice[];
  unclassified: boolean;
};

const UNCLASSIFIED_KEY = "__unclassified__";

const STALENESS_RANK: Record<AssetStalenessValue, number> = {
  fresh: 0,
  stale: 1,
  estimated: 2,
};

function worseStaleness(
  a: AssetStalenessValue,
  b: AssetStalenessValue,
): AssetStalenessValue {
  return STALENESS_RANK[a] >= STALENESS_RANK[b] ? a : b;
}

function valueForDim(holding: Holding, dim: DistributionDimension): {
  key: string;
  label: string;
  unclassified: boolean;
} {
  if (dim === "broker") {
    return { key: holding.brokerId, label: holding.brokerName, unclassified: false };
  }
  if (dim === "sector") {
    if (holding.sector) {
      return {
        key: holding.sector,
        label: translateSector(holding.sector),
        unclassified: false,
      };
    }
    return {
      key: UNCLASSIFIED_KEY,
      label: UNCLASSIFIED,
      unclassified: true,
    };
  }
  if (holding.country) {
    return {
      key: holding.country,
      label: translateCountry(holding.country),
      unclassified: false,
    };
  }
  return {
    key: UNCLASSIFIED_KEY,
    label: UNCLASSIFIED,
    unclassified: true,
  };
}

export function groupByDimension(
  holdings: Holding[],
  equityByHolding: Map<string, number>,
  dim: DistributionDimension,
  stalenessByHolding?: Map<string, AssetStalenessValue>,
  quotesByAsset?: Map<string, { source?: string; observed_at: string }>,
): DistributionResult {
  type Bucket = {
    key: string;
    label: string;
    valueUsd: number;
    holdingsCount: number;
    unclassified: boolean;
    staleness: AssetStalenessValue;
    oldestStaleQuote?: { source?: string; observed_at: string };
  };
  const buckets = new Map<string, Bucket>();
  let totalUsd = 0;
  let unclassified = false;

  for (const holding of holdings) {
    const equity = equityByHolding.get(`${holding.assetId}::${holding.brokerId}`) ?? 0;
    if (equity <= 0) continue;
    const v = valueForDim(holding, dim);
    if (v.unclassified) unclassified = true;
    const holdingStaleness: AssetStalenessValue =
      stalenessByHolding?.get(`${holding.assetId}::${holding.brokerId}`) ??
      "estimated";
    const bucket = buckets.get(v.key) ?? {
      key: v.key,
      label: v.label,
      valueUsd: 0,
      holdingsCount: 0,
      unclassified: v.unclassified,
      staleness: holdingStaleness,
    };
    bucket.valueUsd += equity;
    bucket.holdingsCount += 1;
    bucket.staleness = worseStaleness(bucket.staleness, holdingStaleness);
    const quote = quotesByAsset?.get(holding.assetId);
    if (holdingStaleness === "stale" && quote &&
      (!bucket.oldestStaleQuote || Date.parse(quote.observed_at) < Date.parse(bucket.oldestStaleQuote.observed_at))) {
      bucket.oldestStaleQuote = quote;
    }
    buckets.set(v.key, bucket);
    totalUsd += equity;
  }

  const rawSlices: DistributionSlice[] = Array.from(buckets.values()).map(
    (b) => ({
      key: b.key,
      label: b.label,
      valueUsd: b.valueUsd,
      percent: totalUsd > 0 ? (b.valueUsd / totalUsd) * 100 : 0,
      holdingsCount: b.holdingsCount,
      staleness: b.staleness,
      ...(b.staleness === "stale" && b.oldestStaleQuote ? {
        observedAt: b.oldestStaleQuote.observed_at,
        ...(b.oldestStaleQuote.source ? { source: b.oldestStaleQuote.source } : {}),
      } : {}),
    }),
  );

  rawSlices.sort((a, b) => b.valueUsd - a.valueUsd);

  const rounded = rawSlices.map((s) => ({
    ...s,
    percent: Math.round(s.percent * 100) / 100,
  }));

  const sumRounded =
    Math.round(rounded.reduce((acc, s) => acc + s.percent, 0) * 100) / 100;
  const residual = Math.round((100 - sumRounded) * 100) / 100;
  if (residual !== 0 && rounded.length > 0) {
    rounded[0].percent =
      Math.round((rounded[0].percent + residual) * 100) / 100;
  }

  return { dim, totalUsd, slices: rounded, unclassified };
}
