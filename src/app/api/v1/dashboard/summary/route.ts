import { NextRequest, NextResponse } from "next/server";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import { calculateTotalEquity } from "@/lib/calculations/equity";
import { calculatePortfolioPnl } from "@/lib/calculations/pnl";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { loadDashboardData, resolveDefaultPortfolioId } from "@/lib/dashboard/loader";
import { SummaryQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = SummaryQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const portfolioId = parsed.data.portfolio_id ?? (await resolveDefaultPortfolioId());
    const data = await loadDashboardData(portfolioId);

    const holdings = aggregateHoldings(data.trades, data.assets, data.brokers);
    const { equityUsd, isAnyEstimated } = calculateTotalEquity(
      holdings,
      data.latestMarketPrices,
    );
    const pnl = calculatePortfolioPnl(holdings, equityUsd);

    return NextResponse.json({
      equityUsd,
      investedUsd: pnl.investedUsd,
      realizedPnlUsd: pnl.realizedPnlUsd,
      unrealizedPnlUsd: pnl.unrealizedPnlUsd,
      totalPnlUsd: pnl.totalPnlUsd,
      returnPct: pnl.returnPct,
      holdingsCount: holdings.filter((h) => h.quantity > 0).length,
      isEstimated: isAnyEstimated,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
