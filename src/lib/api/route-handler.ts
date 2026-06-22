import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getCurrentPortfolio, type CurrentPortfolio } from "@/lib/supabase/auth";
import { unauthorized, badRequest, serverError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { errors } from "@/lib/i18n/errors";

type AuthContext = {
  user: User;
  supabase: SupabaseClient;
};

type PortfolioContext = AuthContext & {
  portfolio: CurrentPortfolio;
};

type RouteHandler<T extends AuthContext> = (
  req: NextRequest,
  context: T
) => Promise<NextResponse>;

export function withAuth(
  handler: RouteHandler<AuthContext>,
  options?: { logErrors?: boolean }
) {
  const shouldLog = options?.logErrors ?? true;

  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const supabase = await createUserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return unauthorized();
      }

      return await handler(req, { user, supabase });
    } catch (err) {
      if (shouldLog) {
        logger.error("route-handler", "Unhandled error:", err);
      }
      if (err instanceof Error) {
        return process.env.NODE_ENV === "development"
          ? badRequest(err.message)
          : serverError();
      }
      return serverError();
    }
  };
}

export function withAuthAndPortfolio(
  handler: RouteHandler<PortfolioContext>,
  options?: { logErrors?: boolean }
) {
  const shouldLog = options?.logErrors ?? true;

  return withAuth(async (req, authContext) => {
    const portfolio = await getCurrentPortfolio();
    if (!portfolio) {
      return badRequest(errors.portfolioNotFound);
    }

    try {
      return await handler(req, { ...authContext, portfolio });
    } catch (err) {
      if (shouldLog) {
        logger.error("route-handler", "Unhandled error:", err);
      }
      if (err instanceof Error) {
        return process.env.NODE_ENV === "development"
          ? badRequest(err.message)
          : serverError();
      }
      return serverError();
    }
  }, options);
}
