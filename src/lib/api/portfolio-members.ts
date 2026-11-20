import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { conflict, forbidden, notFound, serverError, validationError } from "@/lib/api/errors";
import { VALID_ROLES, type PortfolioRole } from "@/lib/csv/constants";
import { errors } from "@/lib/i18n/errors";
import type { InviteMemberInput } from "@/lib/validations/members";
import { PortfolioId } from "@/lib/validations/portfolios";

const memberRole = z.object({ user_id: PortfolioId, role: z.enum(VALID_ROLES), created_at: z.string() });
const member = memberRole.extend({ email: z.string().nullable() });
const members = z.array(member);

export class MembershipOperationError extends Error {
  constructor(readonly code: string) {
    super("No se pudo completar la operación de membresía.");
  }
}

export function membershipErrorResponse(error: unknown, missing: string = errors.memberNotFound) {
  switch (error instanceof MembershipOperationError ? error.code : undefined) {
    case "42501": return forbidden(errors.forbidden);
    case "P0002": return notFound(missing);
    case "23505": return conflict(errors.memberAlreadyExists);
    case "PM001": return conflict(errors.lastOwnerGuard);
    case "40001":
    case "40P01": return conflict(errors.memberConcurrentChange);
    case "22023": return validationError([]);
    default: return serverError();
  }
}

export async function listMembers(supabase: SupabaseClient, portfolioId: string) {
  const { data, error } = await supabase.rpc("list_portfolio_members", { p_portfolio_id: portfolioId });
  if (error) throw new MembershipOperationError(error.code);
  return members.parse(data);
}

export async function inviteMember(supabase: SupabaseClient, portfolioId: string, input: InviteMemberInput) {
  const { data, error } = await supabase.rpc("invite_portfolio_member", {
    p_portfolio_id: portfolioId, p_email: input.email, p_role: input.role,
  });
  if (error) throw new MembershipOperationError(error.code);
  return member.parse(data);
}

export async function updateMemberRole(supabase: SupabaseClient, portfolioId: string, userId: string, role: PortfolioRole) {
  const { data, error } = await supabase.rpc("change_portfolio_member_role", {
    p_portfolio_id: portfolioId, p_user_id: userId, p_role: role,
  });
  if (error) throw new MembershipOperationError(error.code);
  return memberRole.parse(data);
}

export async function removeMember(supabase: SupabaseClient, portfolioId: string, userId: string) {
  const { error } = await supabase.rpc("remove_portfolio_member", { p_portfolio_id: portfolioId, p_user_id: userId });
  if (error) throw new MembershipOperationError(error.code);
}
