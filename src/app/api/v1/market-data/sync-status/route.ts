import { NextResponse } from "next/server";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { serverError } from "@/lib/api/errors";
import { aggregateHoldings } from "@/lib/calculations/holdings";
import { loadTradesAndAssets } from "@/lib/dashboard/loader";
import { loadSyncHealth } from "@/lib/dashboard/sync-status";
import { checkSyncStatusRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const auth = await requireApiUserWithPortfolio(undefined, { request });
  if (auth.response) return auth.response;
  if (!checkSyncStatusRateLimit(auth.user.id)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } }, { status: 429, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const { trades, assets, brokers } = await loadTradesAndAssets(auth.portfolio.portfolioId, auth.supabase);
    const activeAssets = aggregateHoldings(trades, assets, brokers).filter(({ quantity }) => quantity > 0).map(({ assetId }) => assetId);
    return NextResponse.json(await loadSyncHealth(activeAssets), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return serverError();
  }
}
