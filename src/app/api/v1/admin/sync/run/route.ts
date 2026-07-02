import { z } from "zod";

import { NextRequest, NextResponse } from "next/server";

import { badRequest, forbidden, serverError, validationError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const SyncRunInput = z.object({
  kind: z.enum(["PRICES", "FX", "PRICES_HISTORY"]),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { user: _user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Cuerpo JSON inválido.");
  }
  const parsed = SyncRunInput.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);

  const portfolio = await getCurrentPortfolio();
  if (!portfolio) return badRequest("No se encontró un portafolio.");
  if (portfolio.role !== "OWNER") {
    return forbidden("Solo los propietarios pueden sincronizar datos.");
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service.rpc("enqueue_sync_run", {
    p_kind: parsed.data.kind,
  });

  if (error) {
    return badRequest(error.message);
  }
  if (typeof data !== "string" || data.length === 0) {
    return serverError("enqueue_sync_run no devolvió un runId.");
  }

  return NextResponse.json({ runId: data }, { status: 202 });
}
