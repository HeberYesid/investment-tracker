import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function proxy(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.pathname === "/" && code) {
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.searchParams.set("code", code);
    return NextResponse.redirect(callbackUrl);
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const result = checkRateLimit(request);
    if (!result.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes. Intenta de nuevo más tarde." } },
        { status: 429, headers: rateLimitHeaders(result) },
      );
    }
    const response = await updateSession(request);
    for (const [key, value] of Object.entries(rateLimitHeaders(result))) {
      response.headers.set(key, value);
    }
    return response;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
