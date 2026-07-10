import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { serverError, validationError } from "@/lib/api/errors";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio(undefined, { writeAccess: true });
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  try {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return serverError();
    }

    const body = await request.json().catch(() => null);
    const parsed = bulkDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("ids invalidos");
    }

    const { ids } = parsed.data;

    const { data: existing } = await supabase
      .from("trades")
      .select("id, portfolio_id")
      .in("id", ids)
      .eq("portfolio_id", portfolio.portfolioId)
      .is("deleted_at", null);

    if (existing && existing.length > 0) {
      const now = new Date().toISOString();

      await supabase
        .from("trades")
        .update({ deleted_at: now })
        .in("id", existing.map((t) => t.id));

      await supabase.from("audit_events").insert(
        existing.map((t) => ({
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

    return NextResponse.json({ deleted: existing?.length ?? 0 });
  } catch {
    return serverError();
  }
}
