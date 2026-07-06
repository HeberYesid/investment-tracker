import { NextRequest, NextResponse } from "next/server";

import { aggregateHoldings } from "@/lib/calculations/holdings";
import {
  aggregateReturns,
  computeAnnualReturnsFromSeries,
} from "@/lib/calculations/returns-aggregation";
import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { resolveAssetPrice } from "@/lib/calculations/pricing";
import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { groupHistoricalPricesByAsset, loadDashboardData } from "@/lib/dashboard/loader";
import { ReturnsQuery } from "@/lib/validations/dashboard";
import type { ReturnsRow } from "@/lib/validations/dashboard";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ReturnsQuery.safeParse(params);
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

    let rows: ReturnsRow[];
    if (parsed.data.groupBy === "year") {
      const historicalPricesByAsset = groupHistoricalPricesByAsset(
        data.historicalPrices,
      );
      const series = buildPortfolioValueSeries(data.trades, {
        historicalPricesByAsset,
      });
      rows = computeAnnualReturnsFromSeries(series.points);
    } else {
      const equityByHolding = new Map<string, number>();
      for (const holding of holdings) {
        const latest = data.latestMarketPrices.find(
          (m) => m.asset_id === holding.assetId,
        );
        const resolved = resolveAssetPrice({
          assetId: holding.assetId,
          latestMarketPrice: latest,
          fallbackTradePriceUsd: holding.averageCost,
        });
        equityByHolding.set(
          `${holding.assetId}::${holding.brokerId}`,
          resolved.priceUsd * holding.quantity,
        );
      }

      rows = aggregateReturns({
        groupBy: parsed.data.groupBy,
        trades: data.trades,
        holdings,
        equityByHolding,
      });
    }

    return NextResponse.json({
      groupBy: parsed.data.groupBy,
      rows,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
