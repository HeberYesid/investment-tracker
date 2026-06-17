import { NextRequest, NextResponse } from "next/server";

import { badRequest, serverError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";
import { loadSnapshot } from "@/lib/dashboard/snapshot";

export async function GET(_request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) return badRequest("No se encontró un portafolio.");
    const data = await loadDashboardData(portfolio.portfolioId, supabase);
    const snapshot = await loadSnapshot(data, supabase);
    return NextResponse.json(snapshot);
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
