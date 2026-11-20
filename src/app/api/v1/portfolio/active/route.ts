import { NextResponse, type NextRequest } from "next/server";

import { requireApiUser } from "@/lib/api/auth";
import { forbidden, notFound, serverError, validationError } from "@/lib/api/errors";
import { errors } from "@/lib/i18n/errors";
import { ACTIVE_PORTFOLIO_COOKIE, listOwnPortfolios } from "@/lib/supabase/auth";
import { SelectPortfolioInput } from "@/lib/validations/portfolios";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  // Next puede normalizar la URL interna a localhost aunque el navegador use otro host.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") === "https"
    ? "https:"
    : request.nextUrl.protocol;
  if (request.headers.get("origin") !== `${protocol}//${host}`) return forbidden();

  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const body: unknown = mediaType === "application/json" ? await request.json().catch(() => null) : null;
  const parsed = SelectPortfolioInput.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);

  try {
    const options = await listOwnPortfolios(auth.supabase);
    const { portfolio_id } = parsed.data;
    if (!options.some((option) => option.portfolioId === portfolio_id)) return notFound(errors.portfolioNotFound);

    const response = new NextResponse(null, { status: 204 });
    response.cookies.set(ACTIVE_PORTFOLIO_COOKIE, `${auth.user.id}:${portfolio_id}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: protocol === "https:",
      path: "/",
    });
    return response;
  } catch {
    return serverError();
  }
}
