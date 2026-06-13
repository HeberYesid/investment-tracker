import { NextResponse } from "next/server";
import { createUserSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createUserSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
