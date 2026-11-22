import { NextRequest, NextResponse } from "next/server";

import { projectDistribution } from "@/lib/calculations/current-valuation";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";
import { buildDashboardValuation } from "@/lib/dashboard/current";
import { DistributionQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = DistributionQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    if (
      parsed.data.portfolio_id &&
      parsed.data.portfolio_id !== portfolio.portfolioId
    ) {
      return badRequest("portfolio_id no coincide con tu portafolio.");
    }
    const data = await loadDashboardData(portfolio.portfolioId, supabase);

    return NextResponse.json(projectDistribution(buildDashboardValuation(data), parsed.data.dim));
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
