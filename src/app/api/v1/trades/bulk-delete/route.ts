import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { serverError, validationError } from "@/lib/api/errors";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true, request });
  if (auth.response) return auth.response;
  const { supabase, user, portfolio } = auth;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("ids invalidos");
    }

    const { ids } = parsed.data;

    const { data: existing, error: fetchError } = await supabase
      .from("trades")
      .select("id, portfolio_id")
      .in("id", ids)
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null);

    if (fetchError) return serverError();

    let deleted = 0;
    if (existing && existing.length > 0) {
      const now = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from("trades")
        .update({ deleted_at: now })
        .in("id", existing.map((t) => t.id))
        .eq("portfolio_id", portfolio.portfolioId)
        .is("deleted_at", null)
        .select("id");

      if (updateError) return serverError();
      const deletedIds = new Set((updated ?? []).map((trade) => trade.id));
      const affected = existing.filter((trade) => deletedIds.has(trade.id));
      deleted = affected.length;

      if (deleted > 0) await supabase.from("audit_events").insert(
        affected.map((t) => ({
          actor_user_id: user.id,
          portfolio_id: t.portfolio_id,
          entity_type: "trade",
          entity_id: t.id,
          action: "DELETE",
          before_json: t,
        })),
      );
    }

    revalidatePath("/");
    revalidatePath("/avanzado");
    revalidateTag("market-prices", "max");

    return NextResponse.json({ deleted });
  } catch {
    return serverError();
  }
}
