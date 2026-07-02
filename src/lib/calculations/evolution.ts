export type EvolutionGranularity = "daily" | "monthly";

export type EvolutionPoint = {
  date: string;
  valueUsd: number;
};

export type EvolutionHistoricalPoint = {
  observedAt: string;
  priceUsd: number;
};

export type EvolutionSeries = {
  points: EvolutionPoint[];
  granularity: EvolutionGranularity;
  from: string;
  to: string;
  isEstimated: boolean;
};

export type EvolutionInputTrade = {
  asset_id: string;
  broker_id?: string;
  trade_date: string;
  trade_type:
    | "BUY"
    | "SELL"
    | "DIVIDEND"
    | "FEE"
    | "TRANSFER_IN"
    | "TRANSFER_OUT";
  quantity: number;
  price_usd: number;
  commission_usd: number;
  deleted_at: string | null;
};

export type BuildEvolutionOptions = {
  granularity?: EvolutionGranularity;
  from?: string;
  to?: string;
  today?: Date;
  historicalPricesByAsset?: Map<string, EvolutionHistoricalPoint[]>;
};

function bucketKey(date: string, granularity: EvolutionGranularity): string {
  const safe = date ?? "";
  if (granularity === "daily") return safe;
  return safe.slice(0, 7) + "-28";
}

function bucketOrder(key: string): number {
  return new Date(key).getTime();
}

function isWithinRange(
  date: string,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function monthEnd(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map((n) => Number(n));
  const lastDay = new Date(y, m, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
}

function nextBucket(
  bucket: string,
  granularity: EvolutionGranularity,
): string {
  if (granularity === "daily") {
    const d = new Date(bucket + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  const [y, m] = (bucket ?? "").slice(0, 7).split("-").map((n) => Number(n));
  const next = new Date(Date.UTC(y, m, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-28`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type AssetState = { quantity: number; fallbackPriceUsd: number };

export function buildPortfolioValueSeries(
  trades: EvolutionInputTrade[],
  options: BuildEvolutionOptions = {},
): EvolutionSeries {
  const granularity = options.granularity ?? "monthly";
  const historicalPricesByAsset =
    options.historicalPricesByAsset ?? new Map<string, EvolutionHistoricalPoint[]>();
  if (trades.length === 0) {
    const today = (options.today ?? new Date()).toISOString().slice(0, 10);
    return {
      points: [],
      granularity,
      from: options.from ?? today,
      to: options.to ?? today,
      isEstimated: true,
    };
  }

  const sortedAll = [...trades].sort((a, b) =>
    (a.trade_date ?? "").localeCompare(b.trade_date ?? ""),
  );

  const firstTradeDate = sortedAll[0].trade_date;
  const today = (options.today ?? new Date()).toISOString().slice(0, 10);
  const to = options.to ?? today;
  const from = options.from ?? firstTradeDate;

  const explicitBuckets = new Set<string>();
  for (const trade of sortedAll) {
    explicitBuckets.add(bucketKey(trade.trade_date, granularity));
  }

  const assetState = new Map<string, AssetState>();
  const explicitValues = new Map<string, number>();
  let anyBucketEstimated = false;

  function priceAtBucket(
    assetId: string,
    bucketDate: string,
    state: AssetState,
  ): number {
    if (state.quantity === 0) return 0;
    const series = historicalPricesByAsset.get(assetId);
    if (series && series.length > 0) {
      const bucketDay = bucketDate.slice(0, 10);
      let chosen: EvolutionHistoricalPoint | null = null;
      for (const point of series) {
        if (point.observedAt.slice(0, 10) <= bucketDay) {
          chosen = point;
        } else {
          break;
        }
      }
      if (chosen) {
        return chosen.priceUsd;
      }
    }
    anyBucketEstimated = true;
    return state.fallbackPriceUsd;
  }

  function computeValue(bucketDate: string): number {
    let total = 0;
    for (const [assetId, state] of assetState.entries()) {
      const price = priceAtBucket(assetId, bucketDate, state);
      total += state.quantity * price;
    }
    return round2(total);
  }

  const active = sortedAll.filter((t) => t.deleted_at === null);
  let pendingBucket: string | null = null;

  for (const trade of active) {
    const bucket = bucketKey(trade.trade_date, granularity);
    if (pendingBucket !== null && pendingBucket !== bucket) {
      const pendingDate =
        granularity === "monthly"
          ? monthEnd((pendingBucket ?? "").slice(0, 7))
          : pendingBucket;
      explicitValues.set(pendingBucket, computeValue(pendingDate));
    }
    pendingBucket = bucket;

    const current = assetState.get(trade.asset_id) ?? {
      quantity: 0,
      fallbackPriceUsd: trade.price_usd,
    };
    switch (trade.trade_type) {
      case "BUY":
      case "TRANSFER_IN":
        current.quantity += trade.quantity;
        current.fallbackPriceUsd = trade.price_usd;
        break;
      case "SELL":
      case "TRANSFER_OUT":
        current.quantity -= trade.quantity;
        current.fallbackPriceUsd = trade.price_usd;
        break;
      case "DIVIDEND":
      case "FEE":
        current.quantity += 0;
        break;
      default:
        break;
    }
    assetState.set(trade.asset_id, current);
  }
  if (pendingBucket !== null) {
    const pendingDate =
      granularity === "monthly"
        ? monthEnd((pendingBucket ?? "").slice(0, 7))
        : pendingBucket;
    explicitValues.set(pendingBucket, computeValue(pendingDate));
  }

  const orderedExplicit = Array.from(explicitBuckets).sort(
    (a, b) => bucketOrder(a) - bucketOrder(b),
  );

  const finalBuckets = new Set<string>(orderedExplicit);
  for (let i = 0; i < orderedExplicit.length - 1; i += 1) {
    let next = nextBucket(orderedExplicit[i], granularity);
    const limit = orderedExplicit[i + 1];
    while (bucketOrder(next) < bucketOrder(limit)) {
      if (!finalBuckets.has(next)) finalBuckets.add(next);
      next = nextBucket(next, granularity);
    }
  }

  const sortedFinal = Array.from(finalBuckets).sort(
    (a, b) => bucketOrder(a) - bucketOrder(b),
  );

  const bucketToValue = new Map<string, number>();
  let lastValue = 0;
  for (const bucket of sortedFinal) {
    if (explicitValues.has(bucket)) {
      lastValue = explicitValues.get(bucket) ?? 0;
    }
    bucketToValue.set(bucket, lastValue);
  }

  const points: EvolutionPoint[] = [];
  for (const bucket of sortedFinal) {
    const pointDate =
      granularity === "monthly" ? monthEnd((bucket ?? "").slice(0, 7)) : bucket;
    if (!isWithinRange(pointDate, from, to)) continue;
    points.push({ date: pointDate, valueUsd: bucketToValue.get(bucket) ?? 0 });
  }

  return {
    points,
    granularity,
    from,
    to,
    isEstimated: anyBucketEstimated,
  };
}
