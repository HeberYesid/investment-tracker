import type { SupabaseClient } from "@supabase/supabase-js";

import { getPriceProvider } from "@/lib/market-data/registry";
import type { YahooRange } from "@/lib/market-data/types";
import { BENCHMARK_TICKER } from "@/lib/dashboard/snapshot";

export type BenchmarkBackfillResult = {
  inserted: number;
  skipped: number;
  message?: string;
};

function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export async function backfillBenchmarkHistory(
  supabase: SupabaseClient,
  range: YahooRange = "2y",
): Promise<BenchmarkBackfillResult> {
  const { data: benchmarkAsset, error: assetError } = await supabase
    .from("assets")
    .select("id, ticker, yahoo_symbol")
    .or(`ticker.eq.${BENCHMARK_TICKER},yahoo_symbol.eq.${BENCHMARK_TICKER}`)
    .limit(1)
    .maybeSingle();

  if (assetError) {
    return { inserted: 0, skipped: 0, message: assetError.message };
  }
  if (!benchmarkAsset) {
    return { inserted: 0, skipped: 0, message: `No se encontró el activo benchmark ${BENCHMARK_TICKER}.` };
  }

  const assetId = (benchmarkAsset as { id: string }).id;
  const yahooSymbol = (benchmarkAsset as { yahoo_symbol: string | null }).yahoo_symbol ?? BENCHMARK_TICKER;

  const provider = getPriceProvider();
  let history;
  try {
    history = await provider.fetchHistory(yahooSymbol, range);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { inserted: 0, skipped: 0, message: `Yahoo fetchHistory failed: ${message}` };
  }

  const { data: existing, error: existingError } = await supabase
    .from("market_prices")
    .select("observed_at")
    .eq("asset_id", assetId)
    .order("observed_at", { ascending: false });
  if (existingError) {
    return { inserted: 0, skipped: 0, message: existingError.message };
  }

  const seenDays = new Set<string>();
  for (const row of (existing ?? []) as Array<{ observed_at: string }>) {
    seenDays.add(utcDayKey(row.observed_at));
  }

  const toInsert: Array<{
    asset_id: string;
    price: number;
    price_usd: number;
    currency: string;
    source: string;
    observed_at: string;
    delayed_until: string | null;
  }> = [];
  let skipped = 0;

  for (const point of history.points) {
    const day = utcDayKey(point.date);
    if (seenDays.has(day)) {
      skipped += 1;
      continue;
    }
    seenDays.add(day);
    toInsert.push({
      asset_id: assetId,
      price: point.value,
      price_usd: point.value,
      currency: "USD",
      source: "BENCHMARK_HISTORY",
      observed_at: point.date,
      delayed_until: null,
    });
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped };
  }

  const { error: insertError } = await supabase.from("market_prices").insert(toInsert);
  if (insertError) {
    return { inserted: 0, skipped, message: insertError.message };
  }

  return { inserted: toInsert.length, skipped };
}
