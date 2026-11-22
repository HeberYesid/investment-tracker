import { cacheLife, cacheTag } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { SyncHealth } from "@/lib/validations/dashboard";

export type PriceRun = {
  status: string;
  started_at: string;
  finished_at: string | null;
  failed_assets: Record<string, string> | null;
};

export function summarizeSyncHealth(
  latest: PriceRun | null, success: PriceRun | null, activeAssetIds: string[], now = Date.now(),
): SyncHealth {
  const cutoff = now - 7 * 24 * 60 * 60_000;
  if (latest && Date.parse(latest.started_at) < cutoff) latest = null;
  if (success && Date.parse(success.finished_at ?? success.started_at) < cutoff) success = null;
  const failures = [...new Set(activeAssetIds)].flatMap((id) => {
    const code = latest?.failed_assets?.[id];
    return code ? [code] : [];
  });
  const lastFailureReason = latest?.status === "FAILED" && activeAssetIds.length > 0 ? "TOTAL_FAILURE"
    : failures.includes("RATE_LIMITED") ? "RATE_LIMITED"
    : failures.includes("TRANSIENT") ? "NETWORK_ERROR"
    : failures.includes("MARKET_CLOSED") ? "MARKET_CLOSED"
    : failures.includes("UPSTREAM_NULL") ? "UPSTREAM_NULL"
    : failures.length ? "PARTIAL_FAILURE" : "NONE";
  const attempt = latest ? Date.parse(latest.started_at) : NaN;
  return {
    lastSuccessAt: success?.finished_at ?? null,
    lastAttemptAt: latest?.started_at ?? null,
    nextRunEstimate: Number.isFinite(attempt) ? new Date(Math.ceil(attempt / 60_000) * 60_000 + 30 * 60_000).toISOString() : null,
    failedAssetCount: lastFailureReason === "TOTAL_FAILURE" ? new Set(activeAssetIds).size : failures.length,
    lastFailureReason,
  };
}

async function readPriceRuns() {
  "use cache";
  cacheTag("market-prices");
  cacheLife({ stale: 0, revalidate: 60, expire: 120 });
  const db = createServiceSupabaseClient();
  const select = () => db.from("market_sync_runs").select("status,started_at,finished_at,failed_assets").eq("kind", "PRICES");
  const [latest, success] = await Promise.all([
    select().order("started_at", { ascending: false }).limit(1).maybeSingle(),
    select().eq("status", "SUCCESS").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (latest.error || success.error) throw new Error("No se pudo consultar el estado de sincronización.");
  return { latest: latest.data as PriceRun | null, success: success.data as PriceRun | null };
}

export async function loadSyncHealth(activeAssetIds: string[], now?: number): Promise<SyncHealth> {
  const { latest, success } = await readPriceRuns();
  return summarizeSyncHealth(latest, success, activeAssetIds, now);
}
