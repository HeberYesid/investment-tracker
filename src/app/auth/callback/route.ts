import { NextResponse, type NextRequest } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createUserSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const reason = error.message.toLowerCase().includes("expired")
      ? "expired"
      : "invalid";
    return NextResponse.redirect(`${origin}/auth/error?reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
