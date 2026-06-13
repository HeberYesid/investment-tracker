import { NextRequest, NextResponse } from "next/server";

import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { loadDashboardData, resolveDefaultPortfolioId } from "@/lib/dashboard/loader";
import { EvolutionQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = EvolutionQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const portfolioId =
      parsed.data.portfolio_id ?? (await resolveDefaultPortfolioId());
    const data = await loadDashboardData(portfolioId);

    const series = buildPortfolioValueSeries(data.trades, {
      granularity: parsed.data.granularity,
      from: parsed.data.from,
      to: parsed.data.to,
    });

    return NextResponse.json({
      granularity: series.granularity,
      from: series.from,
      to: series.to,
      points: series.points,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
