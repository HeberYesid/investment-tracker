// supabase/functions/_shared/record-sync-run.ts
//
// Small wrapper around the public.market_sync_runs table. The Edge
// Functions call these at the start, on success, and on failure of a
// sync run so the admin endpoint and observability dashboards can
// inspect what happened.

import type { ServiceClient } from "./supabase.ts";

export type SyncKind = "PRICES" | "FX";

export async function recordRunStart(
  supabase: ServiceClient,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from("market_sync_runs")
    .update({
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`recordRunStart: ${error.message}`);
  }
}

export async function recordRunSuccess(
  supabase: ServiceClient,
  runId: string,
  details: { assetsProcessed?: number } = {},
): Promise<void> {
  const { error } = await supabase
    .from("market_sync_runs")
    .update({
      status: "SUCCESS",
      finished_at: new Date().toISOString(),
      assets_processed: details.assetsProcessed ?? null,
      error: null,
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`recordRunSuccess: ${error.message}`);
  }
}

export async function recordRunFailure(
  supabase: ServiceClient,
  runId: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("market_sync_runs")
    .update({
      status: "FAILED",
      finished_at: new Date().toISOString(),
      error: message,
    })
    .eq("id", runId);
  if (error) {
    throw new Error(`recordRunFailure: ${error.message}`);
  }
}
