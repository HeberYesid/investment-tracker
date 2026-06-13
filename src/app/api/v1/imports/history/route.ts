import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { badRequest, serverError } from "@/lib/api/errors";

export async function GET(_request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  try {
    const { data, error } = await supabase
      .from("csv_imports")
      .select("*, brokers(name, code)")
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
