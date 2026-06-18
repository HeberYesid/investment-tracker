import { NextRequest, NextResponse } from "next/server";

import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import {
  loadDashboardAggregate,
  type DashboardAggregateScope,
} from "@/lib/dashboard/aggregate";
import {
  DistributionDimension,
  EvolutionGranularity,
  ReturnsGroupBy,
} from "@/lib/validations/dashboard";

const AggregateQuery = {
  safeParse(params: Record<string, string>) {
    const scope: DashboardAggregateScope =
      params.scope === "advanced" ? "advanced" : "full";
    const evolutionGranularity = EvolutionGranularity.safeParse(
      params.granularity,
    );
    const returnsGroupBy = ReturnsGroupBy.safeParse(params.groupBy);
    const distributionDimension = DistributionDimension.safeParse(params.dim);
    if (
      params.granularity &&
      !evolutionGranularity.success
    ) {
      return { success: false as const, error: { issues: evolutionGranularity.error.issues } };
    }
    if (params.groupBy && !returnsGroupBy.success) {
      return { success: false as const, error: { issues: returnsGroupBy.error.issues } };
    }
    if (params.dim && !distributionDimension.success) {
      return { success: false as const, error: { issues: distributionDimension.error.issues } };
    }
    return {
      success: true as const,
      data: {
        scope,
        evolutionGranularity: evolutionGranularity.success
          ? evolutionGranularity.data
          : undefined,
        evolutionFrom: params.from,
        evolutionTo: params.to,
        returnsGroupBy: returnsGroupBy.success
          ? returnsGroupBy.data
          : undefined,
        distributionDimension: distributionDimension.success
          ? distributionDimension.data
          : undefined,
      },
    };
  },
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = AggregateQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

    const portfolio = await getCurrentPortfolio();
    if (!portfolio) return badRequest("No se encontró un portafolio.");

    const aggregate = await loadDashboardAggregate(
      portfolio.portfolioId,
      supabase,
      parsed.data.scope,
      {
        evolutionGranularity: parsed.data.evolutionGranularity,
        evolutionFrom: parsed.data.evolutionFrom,
        evolutionTo: parsed.data.evolutionTo,
        returnsGroupBy: parsed.data.returnsGroupBy,
        distributionDimension: parsed.data.distributionDimension,
      },
    );

    const response = NextResponse.json(aggregate);
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=30, stale-while-revalidate=60",
    );
    return response;
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
