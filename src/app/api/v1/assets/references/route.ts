import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { serverError, validationError } from "@/lib/api/errors";
import { CandidateGroups, CatalogTicker } from "@/lib/validations/asset-catalog";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const parsed = CatalogTicker.array().min(1).max(50).safeParse(request.nextUrl.searchParams.getAll("ticker"));
  if (!parsed.success) return validationError(parsed.error.issues);
  const tickers = [...new Set(parsed.data)];
  try {
    const { data, error } = await auth.supabase.rpc("list_asset_reference_candidates", { p_tickers: tickers });
    const result = CandidateGroups.safeParse(data);
    if (error || !result.success || result.data.length !== tickers.length ||
      new Set(result.data.map(({ ticker }) => ticker)).size !== tickers.length ||
      result.data.some(({ ticker }) => !tickers.includes(ticker))) return serverError();
    return NextResponse.json({ data: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return serverError(); }
}
