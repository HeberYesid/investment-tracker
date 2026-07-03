import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import {
  UpdateTradeInput,
  normalizeTradeUsdValues,
} from "@/lib/validations/trades";
import { notFound, validationError, serverError } from "@/lib/api/errors";

const USD_AFFECTING_FIELDS = [
  "price_original",
  "quantity",
  "commission_original",
  "fx_rate_to_usd",
  "trade_type",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true });
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateTradeInput.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error.issues);
    }

    const input = parsed.data;

    const { data: existing, error: fetchError } = await supabase
      .from("trades")
      .select()
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) {
      return notFound("Operación no encontrada");
    }

    const merged = { ...existing, ...input };
    const needsRecompute = USD_AFFECTING_FIELDS.some(
      (f) => input[f] !== undefined
    );

    const usdValues = needsRecompute
      ? normalizeTradeUsdValues(merged)
      : {};

    const { data: trade, error: updateError } = await supabase
      .from("trades")
      .update({
        ...input,
        ...usdValues,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return notFound(updateError.message);
    }

    await supabase.from("audit_events").insert({
      portfolio_id: trade.portfolio_id,
      entity_type: "trade",
      entity_id: trade.id,
      action: "UPDATE",
      before_json: existing,
      after_json: trade,
    });

    revalidatePath("/");
    revalidatePath("/avanzado");
    revalidateTag("market-prices", "max");

    return NextResponse.json(trade);
  } catch {
    return serverError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true });
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const { id } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from("trades")
      .select()
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) {
      return notFound("Operación no encontrada");
    }

    await supabase
      .from("trades")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    await supabase.from("audit_events").insert({
      portfolio_id: existing.portfolio_id,
      entity_type: "trade",
      entity_id: existing.id,
      action: "DELETE",
      before_json: existing,
    });

    revalidatePath("/");
    revalidatePath("/avanzado");
    revalidateTag("market-prices", "max");

    return new NextResponse(null, { status: 204 });
  } catch {
    return serverError();
  }
}
