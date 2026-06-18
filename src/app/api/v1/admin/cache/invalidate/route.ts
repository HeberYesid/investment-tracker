import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

const ALLOWED_TAGS = new Set(["market-prices", "benchmark"]);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.ADMIN_CACHE_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "ADMIN_CACHE_TOKEN no configurado." } },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Token inválido." } },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const tag = typeof body?.tag === "string" ? body.tag : null;

    if (!tag || !ALLOWED_TAGS.has(tag)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TAG",
            message: `Tag inválido. Permitidos: ${[...ALLOWED_TAGS].join(", ")}.`,
          },
        },
        { status: 400 },
      );
    }

    revalidateTag(tag);

    return NextResponse.json({ invalidated: tag });
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Cuerpo inválido." } },
      { status: 400 },
    );
  }
}
