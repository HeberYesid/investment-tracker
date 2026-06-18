import { NextRequest, NextResponse } from "next/server";

// Deprecated: use GET /api/v1/dashboard/aggregate for a single consolidated
// payload. Kept for backwards compatibility.
import { aggregateHoldings } from "@/lib/calculations/holdings";
import { calculateTotalEquity } from "@/lib/calculations/equity";
import { calculatePortfolioPnl } from "@/lib/calculations/pnl";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";
import { computeAssetStaleness } from "@/lib/dashboard/snapshot";
import { SummaryQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = SummaryQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const portfolio = await getCurrentPortfolio();
    if (!portfolio) return badRequest("No se encontró un portafolio.");
    if (
      parsed.data.portfolio_id &&
      parsed.data.portfolio_id !== portfolio.portfolioId
    ) {
      return badRequest("portfolio_id no coincide con tu portafolio.");
    }
    const data = await loadDashboardData(portfolio.portfolioId, supabase);

    const holdings = aggregateHoldings(data.trades, data.assets, data.brokers);
    const { equityUsd, isAnyEstimated } = calculateTotalEquity(
      holdings,
      data.latestMarketPrices,
    );
    const pnl = calculatePortfolioPnl(holdings, equityUsd);

    const activeAssetIds = Array.from(
      new Set(
        holdings
          .filter((h) => h.quantity > 0)
          .map((h) => h.assetId),
      ),
    );
    const staleness = computeAssetStaleness(
      activeAssetIds,
      data.latestMarketPrices,
    );
    const isAnyStale = Array.from(staleness.values()).some(
      (value) => value === "stale",
    );

    return NextResponse.json({
      equityUsd,
      investedUsd: pnl.investedUsd,
      realizedPnlUsd: pnl.realizedPnlUsd,
      unrealizedPnlUsd: pnl.unrealizedPnlUsd,
      totalPnlUsd: pnl.totalPnlUsd,
      returnPct: pnl.returnPct,
      holdingsCount: holdings.filter((h) => h.quantity > 0).length,
      isEstimated: isAnyEstimated,
      isAnyStale,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
