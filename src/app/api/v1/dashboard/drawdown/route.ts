import { NextRequest, NextResponse } from "next/server";

import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";
import { calculateDrawdown } from "@/lib/calculations/drawdown";
import { badRequest, serverError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { loadDashboardData } from "@/lib/dashboard/loader";

export async function GET(_request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) return badRequest("No se encontró un portafolio.");
    const data = await loadDashboardData(portfolio.portfolioId, supabase);

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
