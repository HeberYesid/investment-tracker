import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import {
  TradeFxInput,
  TradeQuantityInput,
  UpdateTradeInput,
  normalizeTradeUsdValues,
  serializeTradeDTO,
} from "@/lib/validations/trades";
import { conflict, notFound, validationError, serverError } from "@/lib/api/errors";
import { getTradeLabels } from "@/lib/i18n/trades";

const USD_AFFECTING_FIELDS = [
  "price_original",
  "quantity",
  "commission_original",
  "currency_original",
  "fx_rate_to_usd",
  "trade_type",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, user, portfolio } = auth;

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
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) {
      return notFound("Operación no encontrada");
    }

    const merged = { ...existing, ...input };
    const pair = TradeQuantityInput.safeParse({
      trade_type: merged.trade_type,
      quantity: input.quantity ?? (typeof existing.quantity === "string" && existing.quantity.trim()
        ? Number(existing.quantity)
        : existing.quantity),
    });
    if (!pair.success) return validationError(pair.error.issues);

    const fx = TradeFxInput.safeParse({
      currency_original: merged.currency_original,
      fx_rate_to_usd: Number(merged.fx_rate_to_usd),
    });
    if (!fx.success) return validationError(fx.error.issues);

    const needsRecompute = USD_AFFECTING_FIELDS.some(
      (f) => input[f] !== undefined
    ) || Number(existing.fx_rate_to_usd) !== fx.data.fx_rate_to_usd;

    const usdValues = needsRecompute
      ? { ...normalizeTradeUsdValues({ ...merged, ...pair.data, ...fx.data }), fx_rate_to_usd: fx.data.fx_rate_to_usd }
      : {};

    // Dos escrituras dentro del mismo milisegundo también necesitan versiones distintas.
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing.updated_at) + 1)).toISOString();

    const { data: trade, error: updateError } = await supabase
      .from("trades")
      .update({
        ...input,
        ...usdValues,
        updated_at: updatedAt,
      })
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null)
      .eq("updated_at", existing.updated_at)
      .eq("trade_type", existing.trade_type)
      .eq("quantity", existing.quantity)
      .select()
      .maybeSingle();

    if (updateError) {
      return notFound("Error al actualizar la operación.");
    }
    if (!trade) return conflict(getTradeLabels().staleTradeUpdate);

    await supabase.from("audit_events").insert({
      actor_user_id: user.id,
      portfolio_id: portfolio.portfolioId,
      entity_type: "trade",
      entity_id: trade.id,
      action: "UPDATE",
      before_json: existing,
      after_json: trade,
    });

    revalidatePath("/");
    revalidatePath("/avanzado");
    revalidateTag("market-prices", "max");

    return NextResponse.json(serializeTradeDTO(trade));
  } catch {
    return serverError();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, user, portfolio } = auth;

  try {
    const { id } = await params;

    const { data: existing, error: fetchError } = await supabase
      .from("trades")
      .select()
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existing) {
      return notFound("Operación no encontrada");
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("trades")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (deleteError) return serverError();
    if (!deleted) return notFound("Operación no encontrada");

    await supabase.from("audit_events").insert({
      actor_user_id: user.id,
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
