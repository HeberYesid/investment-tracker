import { type NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { unauthorized } from "@/lib/api/errors";

export type AuthedRequest = {
  user: User;
  supabase: SupabaseClient;
};

export type MaybeAuthedRequest =
  | { user: User; supabase: SupabaseClient; response: null }
  | { user: null; supabase: null; response: NextResponse };

export async function requireApiUser(): Promise<MaybeAuthedRequest> {
  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, supabase: null, response: unauthorized() };
  }
  return { user, supabase, response: null };
}
