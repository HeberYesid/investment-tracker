import { NextRequest, NextResponse } from "next/server";

// Deprecated: use GET /api/v1/dashboard/aggregate for a single consolidated
// payload. Kept for backwards compatibility.
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { EvolutionQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = EvolutionQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    if (
      parsed.data.portfolio_id &&
      parsed.data.portfolio_id !== portfolio.portfolioId
    ) {
      return badRequest("portfolio_id no coincide con tu portafolio.");
    }
    const data = await loadDashboardData(portfolio.portfolioId, supabase);

    const historicalPricesByAsset = groupHistoricalPricesByAsset(
      data.historicalPrices,
    );
    const series = buildPortfolioValueSeries(data.trades, {
      granularity: parsed.data.granularity,
      from: parsed.data.from,
      to: parsed.data.to,
      historicalPricesByAsset,
    });

    return NextResponse.json({
      granularity: series.granularity,
      from: series.from,
      to: series.to,
      points: series.points,
      isEstimated: series.isEstimated,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
