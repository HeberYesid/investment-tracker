import { NextRequest, NextResponse } from "next/server";

import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { calculateDrawdown } from "@/lib/calculations/drawdown";
import { badRequest, serverError } from "@/lib/api/errors";
import { loadDashboardData, resolveDefaultPortfolioId } from "@/lib/dashboard/loader";

export async function GET(request: NextRequest) {
  try {
    const portfolioIdParam = request.nextUrl.searchParams.get("portfolio_id");
    const portfolioId = portfolioIdParam ?? (await resolveDefaultPortfolioId());
    const data = await loadDashboardData(portfolioId);

    const series = buildPortfolioValueSeries(data.trades, {
      granularity: "monthly",
    });
    const drawdown = calculateDrawdown(series.points);

    return NextResponse.json({
      series: drawdown.series,
      maxDrawdownPct: drawdown.maxDrawdownPct,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
