import { NextRequest, NextResponse } from "next/server";

// Deprecated: use GET /api/v1/dashboard/aggregate?scope=advanced for a single
// consolidated payload. Kept for backwards compatibility.
import { serverError } from "@/lib/api/errors";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";
import { loadSnapshot } from "@/lib/dashboard/snapshot";

export async function GET(_request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const data = await loadDashboardData(portfolio.portfolioId, supabase);
    const snapshot = await loadSnapshot(data, supabase);
    return NextResponse.json(snapshot);
  } catch {
    return serverError();
  }
}
