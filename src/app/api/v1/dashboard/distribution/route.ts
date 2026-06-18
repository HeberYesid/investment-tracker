import { NextRequest, NextResponse } from "next/server";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import { groupByDimension } from "@/lib/calculations/distribution";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";
import { computeAssetStaleness } from "@/lib/dashboard/snapshot";
import { DistributionQuery } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = DistributionQuery.safeParse(params);
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

    const equityByHolding = new Map<string, number>();
    const stalenessByHolding = new Map<string, "fresh" | "stale" | "estimated">();
    for (const holding of holdings) {
      const key = `${holding.assetId}::${holding.brokerId}`;
      if (!equityByHolding.has(key)) {
        const latest = data.latestMarketPrices.find((m) => m.asset_id === holding.assetId);
        const priceUsd = latest && (!latest.delayed_until || latest.delayed_until <= new Date().toISOString())
          ? Number(latest.price_usd)
          : holding.averageCost;
        equityByHolding.set(key, priceUsd * holding.quantity);
      }
      if (!stalenessByHolding.has(key)) {
        const holdingStaleness = staleness.get(holding.assetId) ?? "estimated";
        stalenessByHolding.set(key, holdingStaleness);
      }
    }

    const result = groupByDimension(
      holdings,
      equityByHolding,
      parsed.data.dim,
      stalenessByHolding,
    );

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
