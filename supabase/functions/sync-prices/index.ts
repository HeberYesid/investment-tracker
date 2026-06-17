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
import { fetchYahooQuote } from "../_shared/yahoo.ts";

type ActiveAssetRow = { asset_id: string; yahoo_symbol: string | null; ticker: string };
type BenchmarkAssetRow = { id: string; yahoo_symbol: string | null; ticker: string };

const BENCHMARK_TICKER = "^GSPC";
const DELAYED_UNTIL_MINUTES = 15;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function listActiveAssets(supabase: ReturnType<typeof getServiceClient>): Promise<ActiveAssetRow[]> {
  const { data, error } = await supabase.rpc("execute_sql", {
    query: `
      select t.asset_id, a.yahoo_symbol, a.ticker
      from public.trades t
      join public.assets a on a.id = t.asset_id
      where t.deleted_at is null
      group by t.asset_id, a.yahoo_symbol, a.ticker
      having sum(
        case
          when t.trade_type in ('BUY', 'TRANSFER_IN') then t.quantity
          when t.trade_type in ('SELL', 'TRANSFER_OUT') then -t.quantity
          else 0
        end
      ) > 0;
    `,
  }).then((res) => res, () => ({ data: null, error: null }));
  // The execute_sql RPC may not exist in Supabase. Fall back to a raw
  // PostgREST select with view if available; here we just attempt a
  // direct select via raw SQL through a custom RPC.
  if (error || !data) {
    // Fallback: query market_prices + assets to find tickers that
    // appear in trades. Simpler approach: select all distinct
    // asset_ids from trades and let the caller dedupe with the
    // benchmark.
    const { data: tradeAssets, error: tradeError } = await supabase
      .from("trades")
      .select("asset_id, assets(yahoo_symbol, ticker)")
      .is("deleted_at", null);
    if (tradeError) {
      throw new Error(`listActiveAssets: ${tradeError.message}`);
    }
    type Row = { asset_id: string; assets: { yahoo_symbol: string | null; ticker: string } | { yahoo_symbol: string | null; ticker: string }[] | null };
    const seen = new Set<string>();
    const result: ActiveAssetRow[] = [];
    for (const row of (tradeAssets ?? []) as Row[]) {
      if (seen.has(row.asset_id)) continue;
      const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
      if (!asset) continue;
      seen.add(row.asset_id);
      result.push({
        asset_id: row.asset_id,
        yahoo_symbol: asset.yahoo_symbol,
        ticker: asset.ticker,
      });
    }
    return result;
  }
  return (data as ActiveAssetRow[]) ?? [];
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
      source: "YAHOO" | "BENCHMARK";
    };
    const jobs: SymbolJob[] = [];
    for (const asset of activeAssets) {
      const symbol = asset.yahoo_symbol ?? asset.ticker;
      if (!symbol) continue;
      jobs.push({ assetId: asset.asset_id, symbol, source: "YAHOO" });
    }
    if (benchmark) {
      const symbol = benchmark.yahoo_symbol ?? benchmark.ticker;
      if (symbol) {
        // Avoid double-syncing ^GSPC if it is also a holding.
        if (!jobs.some((j) => j.symbol === symbol)) {
          jobs.push({ assetId: benchmark.id, symbol, source: "BENCHMARK" });
        }
      }
    }

    const delayedUntil = new Date(Date.now() + DELAYED_UNTIL_MINUTES * 60_000).toISOString();
    let assetsProcessed = 0;
    const errors: Array<{ symbol: string; message: string }> = [];

    for (const job of jobs) {
      const result = await fetchYahooQuote(job.symbol);
      if (!result.ok) {
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
        source: job.source,
        observed_at: quote.observedAt,
        delayed_until: delayedUntil,
      });
      if (insertError) {
        errors.push({ symbol: job.symbol, message: insertError.message });
        continue;
      }
      assetsProcessed += 1;
    }

    await recordRunSuccess(supabase, runId, { assetsProcessed });
    return jsonResponse({ runId, assetsProcessed, errors });
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
