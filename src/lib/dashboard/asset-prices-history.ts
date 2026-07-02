import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveAssetRow = {
  asset_id: string;
  yahoo_symbol: string | null;
  ticker: string;
};

export type HistoricalPriceInsert = {
  asset_id: string;
  price: number;
  price_usd: number;
  currency: string;
  source: string;
  observed_at: string;
  delayed_until: string | null;
};

export type BackfillResult = {
  inserted: number;
  skipped: number;
  message?: string;
};

export type FetchYahooHistoryFn = (
  symbol: string,
  range: string,
  interval: string,
) => Promise<
  | { ok: true; value: Array<{ observedAt: string; priceUsd: number }> }
  | { ok: false; error: { message: string } }
>;

export const PRICE_HISTORY_SOURCE = "PRICE_HISTORY";

function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function startOfTodayUtc(): string {
  return new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
}

export async function listActiveAssetSymbols(
  supabase: SupabaseClient,
): Promise<ActiveAssetRow[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("asset_id, assets(yahoo_symbol, ticker)")
    .is("deleted_at", null);
  if (error) {
    throw new Error(`listActiveAssetSymbols: ${error.message}`);
  }
  type Row = {
    asset_id: string;
    assets:
      | { yahoo_symbol: string | null; ticker: string }
      | { yahoo_symbol: string | null; ticker: string }[]
      | null;
  };
  const seen = new Set<string>();
  const result: ActiveAssetRow[] = [];
  for (const row of (data ?? []) as Row[]) {
    if (seen.has(row.asset_id)) continue;
    const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
    if (!asset) continue;
    if (!asset.yahoo_symbol) continue;
    seen.add(row.asset_id);
    result.push({
      asset_id: row.asset_id,
      yahoo_symbol: asset.yahoo_symbol,
      ticker: asset.ticker,
    });
  }
  return result;
}

export async function backfillAssetHistory(
  supabase: SupabaseClient,
  asset: ActiveAssetRow,
  options: {
    range?: string;
    interval?: string;
    fetchYahooHistory: FetchYahooHistoryFn;
  },
): Promise<BackfillResult> {
  const range = options.range ?? "2y";
  const interval = options.interval ?? "1d";
  const startToday = startOfTodayUtc();
  const { count: todayHistoryCount, error: gateError } = await supabase
    .from("market_prices")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", asset.asset_id)
    .eq("source", PRICE_HISTORY_SOURCE)
    .gte("observed_at", startToday);
  if (gateError) {
    return { inserted: 0, skipped: 0, message: gateError.message };
  }
  if (todayHistoryCount && todayHistoryCount > 0) {
    return { inserted: 0, skipped: 0 };
  }

  const symbol = asset.yahoo_symbol ?? asset.ticker;
  const history = await options.fetchYahooHistory(symbol, range, interval);
  if (!history.ok) {
    return { inserted: 0, skipped: 0, message: history.error.message };
  }

  const { data: existing, error: existingError } = await supabase
    .from("market_prices")
    .select("observed_at")
    .eq("asset_id", asset.asset_id)
    .eq("source", PRICE_HISTORY_SOURCE)
    .order("observed_at", { ascending: false });
  if (existingError) {
    return { inserted: 0, skipped: 0, message: existingError.message };
  }
  const seenDays = new Set<string>();
  for (const row of (existing ?? []) as Array<{ observed_at: string }>) {
    seenDays.add(utcDayKey(row.observed_at));
  }

  const toInsert: HistoricalPriceInsert[] = [];
  let skipped = 0;
  for (const point of history.value) {
    const day = utcDayKey(point.observedAt);
    if (seenDays.has(day)) {
      skipped += 1;
      continue;
    }
    seenDays.add(day);
    toInsert.push({
      asset_id: asset.asset_id,
      price: point.priceUsd,
      price_usd: point.priceUsd,
      currency: "USD",
      source: PRICE_HISTORY_SOURCE,
      observed_at: point.observedAt,
      delayed_until: null,
    });
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped };
  }

  const { error: insertError } = await supabase
    .from("market_prices")
    .insert(toInsert);
  if (insertError) {
    return { inserted: 0, skipped, message: insertError.message };
  }
  return { inserted: toInsert.length, skipped };
}
