import { cache } from "react";
import { redirect } from "next/navigation";
import { createUserSupabaseClient } from "./server";

export type CurrentPortfolio = {
  portfolioId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  portfolio: {
    id: string;
    name: string;
    base_currency: "USD";
  };
};

export const getCurrentUser = cache(async () => {
  const supabase = await createUserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export const getCurrentPortfolio = cache(
  async (): Promise<CurrentPortfolio | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const supabase = await createUserSupabaseClient();
    const { data: member } = await supabase
      .from("portfolio_members")
      .select("portfolio_id, role, portfolios(id, name, base_currency)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!member) return null;
    const portfolio = Array.isArray(member.portfolios)
      ? member.portfolios[0]
      : member.portfolios;
    if (!portfolio) return null;

    return {
      portfolioId: member.portfolio_id,
      role: member.role,
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        base_currency: "USD",
      },
    };
  },
);

export async function requireCurrentPortfolio(): Promise<CurrentPortfolio> {
  const portfolio = await getCurrentPortfolio();
  if (!portfolio) {
    redirect("/login");
  }
  return portfolio;
}
