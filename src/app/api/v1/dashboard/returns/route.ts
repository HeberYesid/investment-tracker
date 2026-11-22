import { NextRequest, NextResponse } from "next/server";

import { aggregateCurrentReturns } from "@/lib/calculations/current-valuation";
import { computeAnnualReturnsFromSeries } from "@/lib/calculations/returns-aggregation";
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { buildDashboardValuation } from "@/lib/dashboard/current";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { ReturnsQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ReturnsQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    if (
      parsed.data.portfolio_id &&
      parsed.data.portfolio_id !== portfolio.portfolioId
    ) {
      return badRequest("portfolio_id no coincide con tu portafolio.");
    }
    const data = await loadDashboardData(portfolio.portfolioId, supabase);

    const { groupBy } = parsed.data;
    if (groupBy === "year") {
      const historicalPricesByAsset = groupHistoricalPricesByAsset(
        data.historicalPrices,
      );
      const series = buildPortfolioValueSeries(data.trades, {
        historicalPricesByAsset,
      });
      return NextResponse.json({ groupBy, rows: computeAnnualReturnsFromSeries(series.points) });
    }

    return NextResponse.json(aggregateCurrentReturns(buildDashboardValuation(data), groupBy));
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
