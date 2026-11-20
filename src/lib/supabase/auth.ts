import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { PortfolioRole } from "@/lib/csv/constants";
import { PortfolioId, PortfolioMemberships } from "@/lib/validations/portfolios";
import { createUserSupabaseClient } from "./server";

export type CurrentPortfolio = {
  portfolioId: string;
  role: PortfolioRole;
  portfolio: {
    id: string;
    name: string;
    base_currency: "USD";
  };
};

export const ACTIVE_PORTFOLIO_COOKIE = "it-active-portfolio";

const getSession = cache(async () => {
  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user, supabase };
});

export const getCurrentUser = cache(async () => (await getSession()).user);

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function listOwnPortfolios(supabase: SupabaseClient): Promise<CurrentPortfolio[]> {
  const { data, error } = await supabase.rpc("list_my_portfolio_memberships");
  const parsed = PortfolioMemberships.safeParse(data);
  if (error || !parsed.success) throw new Error("No se pudieron resolver las membresías.");

  return parsed.data.map(({ portfolio_id, role, name, base_currency }) => ({
    portfolioId: portfolio_id,
    role,
    portfolio: { id: portfolio_id, name, base_currency },
  }));
}

export type PortfolioContext =
  | { kind: "anonymous" }
  | { kind: "error" }
  | { kind: "no-membership"; user: User }
  | { kind: "active"; user: User; supabase: SupabaseClient; portfolio: CurrentPortfolio; options: CurrentPortfolio[] };

export async function resolvePortfolioContext(user: User, supabase: SupabaseClient): Promise<PortfolioContext> {
  try {
    const store = await cookies();
    const [cookieUser, cookiePortfolio, extra] = store.get(ACTIVE_PORTFOLIO_COOKIE)?.value.split(":") ?? [];
    const preferred = cookieUser === user.id && extra === undefined ? PortfolioId.safeParse(cookiePortfolio) : null;
    const options = await listOwnPortfolios(supabase);
    const portfolio = (preferred?.success ? options.find((option) => option.portfolioId === preferred.data) : undefined)
      ?? options[0];
    return portfolio ? { kind: "active", user, supabase, portfolio, options } : { kind: "no-membership", user };
  } catch {
    return { kind: "error" };
  }
}

export const getPortfolioContext = cache(async (): Promise<PortfolioContext> => {
  const { user, supabase } = await getSession();
  return user ? resolvePortfolioContext(user, supabase) : { kind: "anonymous" };
});

export const getCurrentPortfolio = cache(async (): Promise<CurrentPortfolio | null> => {
  const context = await getPortfolioContext();
  return context.kind === "active" ? context.portfolio : null;
});

export async function requireCurrentPortfolio(): Promise<CurrentPortfolio> {
  const context = await getPortfolioContext();
  if (context.kind === "anonymous") redirect("/login");
  if (context.kind !== "active") redirect("/");
  return context.portfolio;
}
