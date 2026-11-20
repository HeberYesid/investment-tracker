import { NextResponse, type NextRequest } from "next/server";

import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { forbidden, validationError } from "@/lib/api/errors";
import { membershipErrorResponse, removeMember, updateMemberRole } from "@/lib/api/portfolio-members";
import { errors } from "@/lib/i18n/errors";
import { UpdateMemberRoleInput } from "@/lib/validations/members";
import { PortfolioId } from "@/lib/validations/portfolios";

type MemberRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: MemberRouteContext) {
  const auth = await requireApiUserWithPortfolio(undefined, { request });
  if (auth.response) return auth.response;
  if (auth.portfolio.role !== "OWNER") return forbidden(errors.forbidden);

  const id = PortfolioId.safeParse((await params).id);
  if (!id.success) return validationError(id.error.issues);
  const input = UpdateMemberRoleInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return validationError(input.error.issues);

  try {
    const data = await updateMemberRole(auth.supabase, auth.portfolio.portfolioId, id.data, input.data.role);
    return NextResponse.json({ data });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: MemberRouteContext) {
  const auth = await requireApiUserWithPortfolio(undefined, { request });
  if (auth.response) return auth.response;
  if (auth.portfolio.role !== "OWNER") return forbidden(errors.forbidden);

  const id = PortfolioId.safeParse((await params).id);
  if (!id.success) return validationError(id.error.issues);

  try {
    await removeMember(auth.supabase, auth.portfolio.portfolioId, id.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}
