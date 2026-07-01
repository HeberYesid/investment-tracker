import { NextResponse, type NextRequest } from "next/server";

import { requireApiUserWithPortfolio } from "@/lib/api/auth";
import { forbidden, serverError, validationError } from "@/lib/api/errors";
import {
  addMember,
  findMemberById,
  findUserByEmail,
  listMembers,
} from "@/lib/api/portfolio-members";
import { errors as errorMessages } from "@/lib/i18n/errors";
import { InviteMemberInput } from "@/lib/validations/members";

export async function GET() {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  if (portfolio.role !== "OWNER") {
    return forbidden(errorMessages.forbidden);
  }

  try {
    const data = await listMembers(supabase, portfolio);
    return NextResponse.json({ data });
  } catch {
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUserWithPortfolio();
  if (auth.response) return auth.response;
  const { supabase, portfolio } = auth;

  if (portfolio.role !== "OWNER") {
    return forbidden(errorMessages.forbidden);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError([{ path: ["body"], message: "Cuerpo JSON inválido." }]);
  }
  const parsed = InviteMemberInput.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues);
  }

  const { email, role } = parsed.data;

  try {
    const userId = await findUserByEmail(supabase, email);
    if (!userId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: errorMessages.userEmailNotFound } },
        { status: 404 },
      );
    }

    const existing = await findMemberById(supabase, portfolio.portfolioId, userId);
    if (existing) {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: errorMessages.memberAlreadyExists } },
        { status: 409 },
      );
    }

    const inserted = await addMember(supabase, portfolio.portfolioId, userId, role);
    if (!inserted) {
      return serverError();
    }

    return NextResponse.json(
      {
        data: {
          user_id: inserted.user_id,
          role: inserted.role,
          email,
          created_at: inserted.created_at,
        },
      },
      { status: 201 },
    );
  } catch {
    return serverError();
  }
}
