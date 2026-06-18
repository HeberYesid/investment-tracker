import { NextRequest, NextResponse } from "next/server";

import { badRequest, forbidden, serverError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { backfillBenchmarkHistory } from "@/lib/dashboard/benchmark-backfill";

export async function POST(_request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return badRequest("No se encontró un portafolio.");
  if (portfolio.role !== "OWNER") {
    return forbidden("Solo los propietarios pueden ejecutar el backfill del benchmark.");
  }

  const service = createServiceSupabaseClient();

  try {
    const result = await backfillBenchmarkHistory(service);
    if (result.message) {
      return serverError(result.message);
    }
    return NextResponse.json({
      inserted: result.inserted,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return serverError(message);
  }
}
