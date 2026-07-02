export type MarketDataFreshness = {
  latestPriceObservedAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
};

export type FreshnessEvaluation = {
  pricesStale: boolean;
  recentSyncAttempt: boolean;
  shouldBackgroundSync: boolean;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function evaluateFreshness(
  freshness: MarketDataFreshness,
  now: Date = new Date(),
): FreshnessEvaluation {
  const nowMs = now.getTime();

  const latestPriceObservedMs =
    freshness.latestPriceObservedAt !== null
      ? new Date(freshness.latestPriceObservedAt).getTime()
      : 0;

  const lastSyncStartedMs =
    freshness.lastSyncStartedAt !== null
      ? new Date(freshness.lastSyncStartedAt).getTime()
      : 0;

  const pricesStale = nowMs - latestPriceObservedMs > THIRTY_MINUTES_MS;
  const recentSyncAttempt = nowMs - lastSyncStartedMs <= THIRTY_MINUTES_MS;
  const shouldBackgroundSync = pricesStale && !recentSyncAttempt;

  return { pricesStale, recentSyncAttempt, shouldBackgroundSync };
}

export async function getMarketDataFreshness(
  supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<MarketDataFreshness | null> {
  const { data, error } = await supabase.rpc("get_market_data_freshness");

  if (error || !data) return null;

  const row = data as
    | { latest_price_observed_at: string | null; last_sync_started_at: string | null; last_sync_finished_at: string | null }
    | Array<{ latest_price_observed_at: string | null; last_sync_started_at: string | null; last_sync_finished_at: string | null }>;

  if (Array.isArray(row)) {
    const first = row[0];
    if (!first) return null;
    return {
      latestPriceObservedAt: first.latest_price_observed_at,
      lastSyncStartedAt: first.last_sync_started_at,
      lastSyncFinishedAt: first.last_sync_finished_at,
    };
  }

  return {
    latestPriceObservedAt: row.latest_price_observed_at,
    lastSyncStartedAt: row.last_sync_started_at,
    lastSyncFinishedAt: row.last_sync_finished_at,
  };
}
