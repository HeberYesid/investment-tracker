import { NextRequest, NextResponse } from "next/server";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import { groupByDimension } from "@/lib/calculations/distribution";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { loadDashboardData, resolveDefaultPortfolioId } from "@/lib/dashboard/loader";
import { DistributionQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = DistributionQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const portfolioId =
      parsed.data.portfolio_id ?? (await resolveDefaultPortfolioId());
    const data = await loadDashboardData(portfolioId);

    const holdings = aggregateHoldings(data.trades, data.assets, data.brokers);

    const equityByHolding = new Map<string, number>();
    for (const holding of holdings) {
      const key = `${holding.assetId}::${holding.brokerId}`;
      if (equityByHolding.has(key)) continue;
      const latest = data.latestMarketPrices.find((m) => m.asset_id === holding.assetId);
      const priceUsd = latest && (!latest.delayed_until || latest.delayed_until <= new Date().toISOString())
        ? Number(latest.price_usd)
        : holding.averageCost;
      equityByHolding.set(key, priceUsd * holding.quantity);
    }

    const result = groupByDimension(holdings, equityByHolding, parsed.data.dim);

    return NextResponse.json({
      dim: result.dim,
      totalUsd: result.totalUsd,
      slices: result.slices,
      unclassified: result.unclassified,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
