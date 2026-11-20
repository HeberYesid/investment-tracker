import { NextRequest, NextResponse } from "next/server";

import { serverError, validationError } from "@/lib/api/errors";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
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
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = AggregateQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);

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

    return NextResponse.json(aggregate, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return serverError();
  }
}
