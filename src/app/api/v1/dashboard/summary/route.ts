import { NextRequest, NextResponse } from "next/server";

import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
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

    const aggregate = await loadDashboardAggregate(
      portfolio.portfolioId,
      supabase,
    );

    const response = NextResponse.json(aggregate.summary);
    response.headers.set("Deprecation", "true");
    response.headers.set(
      "Link",
      '</api/v1/dashboard/aggregate>; rel="alternate"',
    );
    return response;
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
