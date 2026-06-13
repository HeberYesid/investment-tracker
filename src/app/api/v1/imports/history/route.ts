import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { badRequest, serverError } from "@/lib/api/errors";

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const portfolioId = searchParams.portfolio_id;

    if (!portfolioId) {
      return badRequest("portfolio_id es requerido.");
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("csv_imports")
      .select("*, brokers(name, code)")
      .eq("portfolio_id", portfolioId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return badRequest(error.message);
    }

    return NextResponse.json({ data });
  } catch {
    return serverError();
  }
}
