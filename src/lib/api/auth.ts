import { type NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getCurrentPortfolio, type CurrentPortfolio } from "@/lib/supabase/auth";
import { unauthorized, badRequest } from "@/lib/api/errors";
import { errors } from "@/lib/i18n/errors";

export type AuthedRequest = {
  user: User;
  supabase: SupabaseClient;
};

export type MaybeAuthedRequest =
  | { user: User; supabase: SupabaseClient; response: null }
  | { user: null; supabase: null; response: NextResponse };

export type MaybeAuthedWithPortfolio =
  | { user: User; supabase: SupabaseClient; portfolio: CurrentPortfolio; response: null }
  | { user: null; supabase: null; portfolio: null; response: NextResponse };

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

export async function requireApiUserWithPortfolio(): Promise<MaybeAuthedWithPortfolio> {
  const auth = await requireApiUser();
  if (auth.response) {
    return { user: null, supabase: null, portfolio: null, response: auth.response };
  }

  const portfolio = await getCurrentPortfolio();
  if (!portfolio) {
    return {
      user: null,
      supabase: null,
      portfolio: null,
      response: badRequest(errors.portfolioNotFound),
    };
  }

  return { ...auth, portfolio, response: null };
}
