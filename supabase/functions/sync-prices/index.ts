// supabase/functions/sync-prices/index.ts
//
// Edge Function: fetch the latest market price for every asset with an
// open position, plus the S&P 500 benchmark, and insert one
// market_prices row per symbol. Runs on the pg_cron schedule
// `sync-prices-30m` (every 30 minutes) and on demand via
// POST /api/v1/admin/sync/run.
//
// Request body (optional): { runId: uuid } — the calling SQL function
// passes a pre-created market_sync_runs row id. If absent, the function
// creates its own.

import { getServiceClient } from "../_shared/supabase.ts";
import {
  recordRunFailure,
  recordRunStart,
  recordRunSuccess,
} from "../_shared/record-sync-run.ts";
import { fetchYahooHistory, fetchYahooQuote, type YahooProviderResult } from "../_shared/yahoo.ts";
import { invalidateCacheTag } from "../_shared/invalidate-cache.ts";

type ActiveAssetRow = { asset_id: string; symbol: string };
type BenchmarkAssetRow = { id: string; yahoo_symbol: string | null; ticker: string };

const BENCHMARK_TICKER = "^GSPC";
const DELAYED_UNTIL_MINUTES = 15;
const BENCHMARK_HISTORY_RANGE = "2y";
const BENCHMARK_HISTORY_INTERVAL = "1d";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function startOfTodayUtc(): string {
  return new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
}

async function backfillBenchmarkHistory(
  supabase: ReturnType<typeof getServiceClient>,
  benchmark: BenchmarkAssetRow,
): Promise<{ inserted: number; skipped: number; message?: string }> {
  const startToday = startOfTodayUtc();
  const { count: todayHistoryCount, error: gateError } = await supabase
    .from("market_prices")
    .select("id", { count: "exact", head: true })
    .eq("asset_id", benchmark.id)
    .eq("source", "BENCHMARK_HISTORY")
    .gte("observed_at", startToday);
  if (gateError) {
    return { inserted: 0, skipped: 0, message: gateError.message };
  }
  if (todayHistoryCount && todayHistoryCount > 0) {
    return { inserted: 0, skipped: 0 };
  }

  const history = await fetchYahooHistory(
    benchmark.yahoo_symbol ?? benchmark.ticker,
    BENCHMARK_HISTORY_RANGE,
    BENCHMARK_HISTORY_INTERVAL,
  );
  if (!history.ok) {
    return { inserted: 0, skipped: 0, message: history.error.message };
  }

  const { data: existing, error: existingError } = await supabase
    .from("market_prices")
    .select("observed_at")
    .eq("asset_id", benchmark.id)
    .order("observed_at", { ascending: false });
  if (existingError) {
    return { inserted: 0, skipped: 0, message: existingError.message };
  }
  const seenDays = new Set<string>();
  for (const row of (existing ?? []) as Array<{ observed_at: string }>) {
    seenDays.add(utcDayKey(row.observed_at));
  }

  const toInsert: Array<{ asset_id: string; price: number; price_usd: number; currency: string; source: string; observed_at: string; delayed_until: string | null }> = [];
  let skipped = 0;
  for (const point of history.value) {
    const day = utcDayKey(point.observedAt);
    if (seenDays.has(day)) {
      skipped += 1;
      continue;
    }
    seenDays.add(day);
    toInsert.push({
      asset_id: benchmark.id,
      price: point.priceUsd,
      price_usd: point.priceUsd,
      currency: "USD",
      source: "BENCHMARK_HISTORY",
      observed_at: point.observedAt,
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

async function listActiveAssets(supabase: ReturnType<typeof getServiceClient>): Promise<ActiveAssetRow[]> {
  const { data: tradeAssets, error: tradeError } = await supabase
    .from("trades")
    .select("asset_id, assets(yahoo_symbol, ticker, requires_verified_quote_symbol)")
    .is("deleted_at", null);
  if (tradeError) {
    throw new Error(`listActiveAssets: ${tradeError.message}`);
  }
  type Asset = {
    yahoo_symbol: string | null;
    ticker: string;
    requires_verified_quote_symbol: boolean;
  };
  type Row = {
    asset_id: string;
    assets: Asset | Asset[] | null;
  };
  const seen = new Set<string>();
  const result: ActiveAssetRow[] = [];
  for (const row of (tradeAssets ?? []) as Row[]) {
    if (seen.has(row.asset_id)) continue;
    const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
    if (!asset) continue;
    const symbol = asset.requires_verified_quote_symbol
      ? asset.yahoo_symbol?.trim()
      : asset.yahoo_symbol ?? asset.ticker;
    if (!symbol) continue;
    seen.add(row.asset_id);
    result.push({ asset_id: row.asset_id, symbol });
  }
  return result;
}

async function findBenchmarkAsset(supabase: ReturnType<typeof getServiceClient>): Promise<BenchmarkAssetRow | null> {
  const { data, error } = await supabase
    .from("assets")
    .select("id, yahoo_symbol, ticker")
    .or(`ticker.eq.${BENCHMARK_TICKER},yahoo_symbol.eq.${BENCHMARK_TICKER}`)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`findBenchmarkAsset: ${error.message}`);
  }
  return (data as BenchmarkAssetRow | null) ?? null;
}

async function createPendingRun(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data, error } = await supabase
    .from("market_sync_runs")
    .insert({ kind: "PRICES", status: "PENDING" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createPendingRun: ${error?.message ?? "no id returned"}`);
  }
  return (data as { id: string }).id;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  const supabase = getServiceClient();
  let runId: string | null = null;
  try {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }
    let body: { runId?: unknown } = {};
    try {
      body = (await request.json()) as { runId?: unknown };
    } catch {
      // Empty body is OK.
    }
    runId = isUuid(body.runId) ? body.runId : null;

    if (!runId) {
      runId = await createPendingRun(supabase);
    }
    await recordRunStart(supabase, runId);

    const activeAssets = await listActiveAssets(supabase);
    const benchmark = await findBenchmarkAsset(supabase);

    type SymbolJob = {
      assetId: string;
      symbol: string;
      isBenchmark: boolean;
    };
    const jobs: SymbolJob[] = [];
    for (const asset of activeAssets) {
      const symbol = asset.symbol;
      if (!symbol) continue;
      jobs.push({ assetId: asset.asset_id, symbol, isBenchmark: false });
    }
    if (benchmark) {
      const symbol = benchmark.yahoo_symbol ?? benchmark.ticker;
      if (symbol) {
        // Avoid double-syncing ^GSPC if it is also a holding.
        if (!jobs.some((j) => j.symbol === symbol)) {
          jobs.push({ assetId: benchmark.id, symbol, isBenchmark: true });
        }
      }
    }

    const delayedUntil = new Date(Date.now() + DELAYED_UNTIL_MINUTES * 60_000).toISOString();
    let assetsProcessed = 0;
    const failedAssets: Record<string, string> = {};
    const errors: Array<{ symbol: string; message: string }> = [];

    for (const job of jobs) {
      const result = await fetchYahooQuote(job.symbol).catch((): YahooProviderResult => ({
        ok: false,
        error: { code: "TRANSIENT", message: `Yahoo: request failed for ${job.symbol}` },
      }));
      if (!result.ok) {
        if (!job.isBenchmark) {
          failedAssets[job.assetId] = result.error.message === "Yahoo: no usable price in chart response"
            ? "UPSTREAM_NULL" : result.error.code;
        }
        errors.push({ symbol: job.symbol, message: result.error.message });
        continue;
      }
      const quote = result.value;
      const currency = quote.currency === "COP" ? "COP" : "USD";
      let priceUsd = quote.priceUsd;

      if (currency === "COP") {
        const { data: fxRow, error: fxError } = await supabase
          .from("fx_rates")
          .select("rate")
          .eq("from_currency", "COP")
          .eq("to_currency", "USD")
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fxError || !fxRow) {
          if (!job.isBenchmark) failedAssets[job.assetId] = "PARTIAL_FAILURE";
          errors.push({ symbol: job.symbol, message: `No COP→USD FX rate available` });
          continue;
        }
        priceUsd = quote.priceUsd * fxRow.rate;
      }

      const { error: insertError } = await supabase.from("market_prices").insert({
        asset_id: job.assetId,
        price: quote.priceUsd,
        price_usd: priceUsd,
        currency,
        source: job.isBenchmark ? "BENCHMARK" : "YAHOO",
        observed_at: quote.observedAt,
        delayed_until: delayedUntil,
      });
      if (insertError) {
        if (!job.isBenchmark) failedAssets[job.assetId] = "PARTIAL_FAILURE";
        errors.push({ symbol: job.symbol, message: insertError.message });
        continue;
      }
      assetsProcessed += 1;
    }

    let benchmarkBackfill: { inserted: number; skipped: number; message?: string } | null = null;
    if (benchmark) {
      benchmarkBackfill = await backfillBenchmarkHistory(supabase, benchmark);
      if (benchmarkBackfill.message) {
        errors.push({
          symbol: benchmark.yahoo_symbol ?? benchmark.ticker,
          message: `benchmark backfill: ${benchmarkBackfill.message}`,
        });
      }
    }

    await recordRunSuccess(supabase, runId, { assetsProcessed, failedAssets });

    await invalidateCacheTag("market-prices");
    if (benchmark) {
      await invalidateCacheTag("benchmark");
    }

    return jsonResponse({ runId, assetsProcessed, errors, benchmarkBackfill });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      try {
        await recordRunFailure(supabase, runId, message);
      } catch {
        // Swallow secondary errors so the original message reaches the client.
      }
    }
    return jsonResponse({ error: message }, 500);
  }
});
