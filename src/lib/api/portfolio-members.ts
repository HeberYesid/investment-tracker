import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentPortfolio } from "@/lib/supabase/auth";
import type { PortfolioRole } from "@/lib/csv/constants";

export type MemberRecord = {
  user_id: string;
  role: PortfolioRole;
  email: string | null;
  created_at: string;
};

type RawMemberRow = {
  user_id: string;
  role: PortfolioRole;
  created_at: string;
};

/**
 * List members of the current portfolio. `email` is left null — the
 * members UI resolves emails per-row client-side via a parallel
 * `find_user_by_email` round-trip, since `auth.users.email` is not
 * directly readable from authenticated clients.
 */
export async function listMembers(
  supabase: SupabaseClient,
  portfolio: CurrentPortfolio,
): Promise<MemberRecord[]> {
  const { data, error } = await supabase
    .from("portfolio_members")
    .select("user_id, role, created_at")
    .eq("portfolio_id", portfolio.portfolioId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as RawMemberRow[]).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    email: null,
    created_at: row.created_at,
  }));
}

export async function findMemberById(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
): Promise<RawMemberRow | null> {
  const { data } = await supabase
    .from("portfolio_members")
    .select("user_id, role, created_at")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data as RawMemberRow | null) ?? null;
}

export async function addMember(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
  role: PortfolioRole,
): Promise<RawMemberRow | null> {
  const { data, error } = await supabase
    .from("portfolio_members")
    .insert({
      portfolio_id: portfolioId,
      user_id: userId,
      role,
    })
    .select("user_id, role, created_at")
    .single();

  if (error || !data) {
    return null;
  }
  return data as RawMemberRow;
}

export async function updateMemberRole(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
  role: PortfolioRole,
): Promise<RawMemberRow | null> {
  const { data, error } = await supabase
    .from("portfolio_members")
    .update({ role })
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .select("user_id, role, created_at")
    .single();

  if (error || !data) {
    return null;
  }
  return data as RawMemberRow;
}

export async function removeMember(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("portfolio_members")
    .delete()
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId);

  return !error;
}

export async function countPortfolioOwners(
  supabase: SupabaseClient,
  portfolioId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_portfolio_owners", {
    p_portfolio_id: portfolioId,
  });

  if (error || typeof data !== "number") {
    return 0;
  }
  return data;
}

export async function findUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("find_user_by_email", {
    p_email: email,
  });

  if (error || typeof data !== "string") {
    return null;
  }
  return data;
}
