import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async (req: NextRequest) => NextResponse.next({ request: req })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 100, reset: 0 })),
  rateLimitHeaders: vi.fn(() => ({})),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");

const { proxy } = await import("@/proxy");

afterEach(() => {
  vi.clearAllMocks();
});

function buildRequest(pathname: string, search?: string): NextRequest {
  return new NextRequest(new URL(`https://test.example.com${pathname}${search ?? ""}`));
}

describe("proxy code redirect", () => {
  it("redirects /?code=... to /auth/callback", async () => {
    const request = buildRequest("/", "?code=abc-123");

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://test.example.com/auth/callback?code=abc-123",
    );
  });

  it("does not redirect /api/* with code param", async () => {
    const request = buildRequest("/api/v1/trades", "?code=abc-123");

    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it("does not redirect / without code", async () => {
    const request = buildRequest("/");

    const response = await proxy(request);

    expect(response.status).toBe(200);
  });

  it("does not redirect /trades with code param", async () => {
    const request = buildRequest("/trades", "?code=abc-123");

    const response = await proxy(request);

    expect(response.status).toBe(200);
  });
});
