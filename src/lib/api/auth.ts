import { type NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { resolvePortfolioContext, type CurrentPortfolio } from "@/lib/supabase/auth";
import { unauthorized, badRequest, forbidden, serverError, conflict } from "@/lib/api/errors";
import { errors } from "@/lib/i18n/errors";
import { EXPECTED_PORTFOLIO_HEADER } from "@/lib/portfolio-context";

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

export type RequirePortfolioOptions = {
  writeAccess?: boolean;
  request?: Pick<Request, "headers">;
};

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

export async function requireApiUserWithPortfolio(
  _supabase?: SupabaseClient,
  options: RequirePortfolioOptions = {},
): Promise<MaybeAuthedWithPortfolio> {
  const auth = await requireApiUser();
  if (auth.response) {
    return { user: null, supabase: null, portfolio: null, response: auth.response };
  }

  const context = await resolvePortfolioContext(auth.user, auth.supabase);
  if (context.kind !== "active") {
    return {
      user: null,
      supabase: null,
      portfolio: null,
      response: context.kind === "no-membership" ? badRequest(errors.portfolioNotFound) : serverError(),
    };
  }

  const { portfolio } = context;
  const expected = options.request?.headers.get(EXPECTED_PORTFOLIO_HEADER);
  if (expected != null && expected.toLowerCase() !== portfolio.portfolioId) {
    return { user: null, supabase: null, portfolio: null, response: conflict(errors.stalePortfolio) };
  }
  if (options.writeAccess && portfolio.role === "VIEWER") {
    return {
      user: null,
      supabase: null,
      portfolio: null,
      response: forbidden(errors.writeAccessDenied),
    };
  }

  return { ...auth, portfolio, response: null };
}
