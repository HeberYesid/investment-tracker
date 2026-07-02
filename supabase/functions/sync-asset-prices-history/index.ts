// supabase/functions/sync-asset-prices-history/index.ts
//
// Edge Function: backfill historical market prices for every asset with
// an open position, so the "Evolución del portafolio" chart can show a
// smooth line based on actual market prices instead of jumping on every
// trade.
//
// Runs on the pg_cron schedule `sync-asset-prices-history-daily`
// (00:30 UTC daily) and on demand via POST /api/v1/admin/sync/run with
// `{ kind: "PRICES_HISTORY" }`.
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
import { fetchYahooHistory } from "../_shared/yahoo.ts";
import { invalidateCacheTag } from "../_shared/invalidate-cache.ts";
import {
  backfillAssetHistory,
  listActiveAssetSymbols,
} from "../../../src/lib/dashboard/asset-prices-history.ts";

const HISTORY_RANGE = "2y";
const HISTORY_INTERVAL = "1d";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function createPendingRun(
  supabase: ReturnType<typeof getServiceClient>,
): Promise<string> {
  const { data, error } = await supabase
    .from("market_sync_runs")
    .insert({ kind: "PRICES_HISTORY", status: "PENDING" })
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

    const assets = await listActiveAssetSymbols(supabase);
    let assetsProcessed = 0;
    const errors: Array<{ assetId: string; symbol: string; message: string }> = [];

    for (const asset of assets) {
      const symbol = asset.yahoo_symbol ?? asset.ticker;
      const result = await backfillAssetHistory(supabase, asset, {
        range: HISTORY_RANGE,
        interval: HISTORY_INTERVAL,
        fetchYahooHistory,
      });
      if (result.message) {
        errors.push({ assetId: asset.asset_id, symbol, message: result.message });
        continue;
      }
      if (result.inserted > 0) {
        assetsProcessed += 1;
      }
    }

    await recordRunSuccess(supabase, runId, { assetsProcessed });

    await invalidateCacheTag("asset-prices-history");

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
