import { NextResponse, type NextRequest } from "next/server";

import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import {
  forbidden,
  notFound,
  serverError,
  validationError,
} from "@/lib/api/errors";
import {
  countPortfolioOwners,
  findMemberById,
  removeMember,
  updateMemberRole,
} from "@/lib/api/portfolio-members";
import { errors as errorMessages } from "@/lib/i18n/errors";
import { UpdateMemberRoleInput } from "@/lib/validations/members";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return uuidRegex.test(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  if (portfolio.role !== "OWNER") {
    return forbidden(errorMessages.forbidden);
  }

  const { id: memberId } = await params;
  if (!isUuid(memberId)) {
    return notFound(errorMessages.memberNotFound);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError([{ path: ["body"], message: "Cuerpo JSON inválido." }]);
  }
  const parsed = UpdateMemberRoleInput.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues);
  }

  const { role } = parsed.data;

  try {
    const existing = await findMemberById(supabase, portfolio.portfolioId, memberId);
    if (!existing) {
      return notFound(errorMessages.memberNotFound);
    }

    // "Last OWNER" guard: if we are about to demote an OWNER, make sure
    // at least one OWNER would remain. We delegate the count to the
    // SECURITY DEFINER function for consistency, and rely on the
    // serialized PATCH semantics to avoid a TOCTOU race in practice.
    if (existing.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await countPortfolioOwners(supabase, portfolio.portfolioId);
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: errorMessages.lastOwnerGuard } },
          { status: 409 },
        );
      }
    }

    const updated = await updateMemberRole(
      supabase,
      portfolio.portfolioId,
      memberId,
      role,
    );
    if (!updated) {
      return serverError();
    }

    return NextResponse.json({ data: updated });
  } catch {
    return serverError();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  if (portfolio.role !== "OWNER") {
    return forbidden(errorMessages.forbidden);
  }

  const { id: memberId } = await params;
  if (!isUuid(memberId)) {
    return notFound(errorMessages.memberNotFound);
  }

  try {
    const existing = await findMemberById(supabase, portfolio.portfolioId, memberId);
    if (!existing) {
      return notFound(errorMessages.memberNotFound);
    }

    if (existing.role === "OWNER") {
      const ownerCount = await countPortfolioOwners(supabase, portfolio.portfolioId);
      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: { code: "CONFLICT", message: errorMessages.lastOwnerGuard } },
          { status: 409 },
        );
      }
    }

    const removed = await removeMember(supabase, portfolio.portfolioId, memberId);
    if (!removed) {
      return serverError();
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return serverError();
  }
}
