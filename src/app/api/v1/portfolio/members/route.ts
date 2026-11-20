import { NextResponse, type NextRequest } from "next/server";

import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { forbidden, validationError } from "@/lib/api/errors";
import { inviteMember, listMembers, membershipErrorResponse } from "@/lib/api/portfolio-members";
import { errors } from "@/lib/i18n/errors";
import { InviteMemberInput } from "@/lib/validations/members";

export async function GET() {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  if (auth.portfolio.role !== "OWNER") return forbidden(errors.forbidden);

  try {
    const data = await listMembers(auth.supabase, auth.portfolio.portfolioId);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return membershipErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio(undefined, { request });
  if (auth.response) return auth.response;
  if (auth.portfolio.role !== "OWNER") return forbidden(errors.forbidden);

  const input = InviteMemberInput.safeParse(await request.json().catch(() => null));
  if (!input.success) return validationError(input.error.issues);

  try {
    const data = await inviteMember(auth.supabase, auth.portfolio.portfolioId, input.data);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return membershipErrorResponse(error, errors.userEmailNotFound);
  }
}
