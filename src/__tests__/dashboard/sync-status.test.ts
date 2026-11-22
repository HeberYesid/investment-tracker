import { expect, it } from "vitest";
import { summarizeSyncHealth, type PriceRun } from "@/lib/dashboard/sync-status";
import { checkSyncStatusRateLimit } from "@/lib/rate-limit";

const now = Date.parse("2026-06-17T22:00:00Z");
const run: PriceRun = {
  status: "SUCCESS", started_at: "2026-06-17T21:45:20Z", finished_at: "2026-06-17T21:48:00Z",
  failed_assets: { mine: "RATE_LIMITED", unrelated: "TRANSIENT" },
};

it("solo cuenta fallos de posiciones activas y nunca devuelve detalles crudos", () => {
  expect(summarizeSyncHealth(run, run, ["mine", "mine"], now)).toEqual({
    lastSuccessAt: run.finished_at, lastAttemptAt: run.started_at,
    nextRunEstimate: "2026-06-17T22:16:00.000Z", failedAssetCount: 1, lastFailureReason: "RATE_LIMITED",
  });
  expect(summarizeSyncHealth(run, run, ["other"], now)).toMatchObject({ failedAssetCount: 0, lastFailureReason: "NONE" });
});

it("distingue fallo total y la ausencia de corridas recientes", () => {
  expect(summarizeSyncHealth({ ...run, status: "FAILED", failed_assets: null }, run, ["mine"], now)).toMatchObject({ lastFailureReason: "TOTAL_FAILURE", failedAssetCount: 1 });
  expect(summarizeSyncHealth(run, run, ["mine"], now + 8 * 86_400_000)).toEqual({
    lastSuccessAt: null, lastAttemptAt: null, nextRunEstimate: null, failedAssetCount: 0, lastFailureReason: "NONE",
  });
});

it("limita por usuario en una ventana móvil de un minuto", () => {
  for (let i = 0; i < 60; i++) expect(checkSyncStatusRateLimit("uno", now + i)).toBe(true);
  expect(checkSyncStatusRateLimit("uno", now + 60)).toBe(false);
  expect(checkSyncStatusRateLimit("dos", now + 60)).toBe(true);
  expect(checkSyncStatusRateLimit("uno", now + 60_000)).toBe(true);
});
