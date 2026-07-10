import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { serverError } from "@/lib/api/errors";

export async function GET(_request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from("csv_imports")
      .select("*, brokers(name, code)")
      .eq("portfolio_id", portfolio.portfolioId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return serverError();
    }

    return NextResponse.json({ data });
  } catch {
    return serverError();
  }
}
