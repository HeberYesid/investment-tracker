import { NextRequest, NextResponse } from "next/server";

import { badRequest, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { LatestFxQuery, summarizeLatestFxRate } from "@/lib/validations/fx";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = LatestFxQuery.safeParse(params);
    if (!parsed.success) return validationError(parsed.error.issues);
    if (parsed.data.from === parsed.data.to) {
      return badRequest("from y to deben ser diferentes.");
    }

    const { data, error } = await supabase
      .from("fx_rates")
      .select("rate, observed_at, source")
      .eq("from_currency", parsed.data.from)
      .eq("to_currency", parsed.data.to)
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return badRequest(error.message);
    }

    const summary = summarizeLatestFxRate(data ?? null);

    return NextResponse.json({
      fromCurrency: parsed.data.from,
      toCurrency: parsed.data.to,
      ...summary,
    });
  } catch (err) {
    if (err instanceof Error) return badRequest(err.message);
    return serverError();
  }
}
