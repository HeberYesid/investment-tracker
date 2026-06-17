// supabase/functions/sync-fx-rates/index.ts
//
// Edge Function: fetch the latest USD/COP rate from open.er-api.com
// and insert a fresh fx_rates row. Runs daily at 06:00 UTC via
// pg_cron (`sync-fx-rates-daily`) and on demand via
// POST /api/v1/admin/sync/run.

import { getServiceClient } from "../_shared/supabase.ts";
import {
  recordRunFailure,
  recordRunStart,
  recordRunSuccess,
} from "../_shared/record-sync-run.ts";
import { fetchOpenErApiLatest } from "../_shared/open-er-api.ts";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function createPendingRun(supabase: ReturnType<typeof getServiceClient>): Promise<string> {
  const { data, error } = await supabase
    .from("market_sync_runs")
    .insert({ kind: "FX", status: "PENDING" })
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

    const result = await fetchOpenErApiLatest();
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    let inserted = 0;
    for (const rate of result.value) {
      const { error: insertError } = await supabase.from("fx_rates").insert({
        from_currency: rate.fromCurrency,
        to_currency: rate.toCurrency,
        rate: rate.rate,
        source: "open.er-api.com",
        observed_at: rate.observedAt,
      });
      if (insertError) {
        throw new Error(`fx_rates insert ${rate.fromCurrency}->${rate.toCurrency}: ${insertError.message}`);
      }
      inserted += 1;
    }
    await recordRunSuccess(supabase, runId, { assetsProcessed: inserted });
    return jsonResponse({ runId, assetsProcessed: inserted });
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
