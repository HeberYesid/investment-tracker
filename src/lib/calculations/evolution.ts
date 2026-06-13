export type EvolutionGranularity = "daily" | "monthly";

export type EvolutionPoint = {
  date: string;
  valueUsd: number;
};

export type EvolutionSeries = {
  points: EvolutionPoint[];
  granularity: EvolutionGranularity;
  from: string;
  to: string;
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

type AssetState = { quantity: number; latestPriceUsd: number };

export function buildPortfolioValueSeries(
  trades: EvolutionInputTrade[],
  options: BuildEvolutionOptions = {},
): EvolutionSeries {
  const granularity = options.granularity ?? "monthly";
  if (trades.length === 0) {
    const today = (options.today ?? new Date()).toISOString().slice(0, 10);
    return {
      points: [],
      granularity,
      from: options.from ?? today,
      to: options.to ?? today,
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

  function computeValue(): number {
    let total = 0;
    for (const state of assetState.values()) {
      total += state.quantity * state.latestPriceUsd;
    }
    return round2(total);
  }

  const active = sortedAll.filter((t) => t.deleted_at === null);
  let pendingBucket: string | null = null;

  for (const trade of active) {
    const bucket = bucketKey(trade.trade_date, granularity);
    if (pendingBucket !== null && pendingBucket !== bucket) {
      explicitValues.set(pendingBucket, computeValue());
    }
    pendingBucket = bucket;

    const current = assetState.get(trade.asset_id) ?? {
      quantity: 0,
      latestPriceUsd: trade.price_usd,
    };
    switch (trade.trade_type) {
      case "BUY":
      case "TRANSFER_IN":
        current.quantity += trade.quantity;
        break;
      case "SELL":
      case "TRANSFER_OUT":
        current.quantity -= trade.quantity;
        break;
      default:
        break;
    }
    current.latestPriceUsd = trade.price_usd;
    assetState.set(trade.asset_id, current);
  }
  if (pendingBucket !== null) {
    explicitValues.set(pendingBucket, computeValue());
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
    } else {
      lastValue = computeValue();
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

  return { points, granularity, from, to };
}
