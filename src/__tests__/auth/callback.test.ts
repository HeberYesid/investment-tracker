import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

let mockExchangeResult: { error: null | { message: string } } = {
  error: null,
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      config: {
        cookies: {
          getAll: () => { name: string; value: string }[];
          setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
        };
      },
    ) => ({
      auth: {
        exchangeCodeForSession: vi.fn(async (_code: string) => {
          // Simulate supabase-js writing auth cookies via the configured setAll callback
          config.cookies.setAll([
            { name: "sb-test-auth-token", value: "session-token", options: { path: "/" } },
          ]);
          return mockExchangeResult;
        }),
      },
    }),
  ),
}));

import { GET } from "@/app/auth/callback/route";

function buildRequest(pathname = "/auth/callback", params?: Record<string, string>): NextRequest {
  const url = new URL(`https://test.example.com${pathname}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new NextRequest(url);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  mockExchangeResult = { error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /auth/callback", () => {
  it("exchanges the code and redirects to the next path on success", async () => {
    const request = buildRequest("/auth/callback", { code: "valid-code", next: "/trades" });

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://test.example.com/trades");
  });

  it("writes session cookies on the redirect response after successful exchange", async () => {
    const request = buildRequest("/auth/callback", { code: "valid-code", next: "/" });

    const response = await GET(request);

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("sb-test-auth-token");
    expect(setCookie).toContain("session-token");
  });

  it("redirects to /auth/error when exchange fails with expired code", async () => {
    mockExchangeResult = { error: { message: "token is expired" } };
    const request = buildRequest("/auth/callback", { code: "expired-code", next: "/" });

    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "https://test.example.com/auth/error?reason=expired",
    );
  });

  it("redirects to /auth/error when exchange fails with other error", async () => {
    mockExchangeResult = { error: { message: "invalid request" } };
    const request = buildRequest("/auth/callback", { code: "bad-code", next: "/" });

    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "https://test.example.com/auth/error?reason=invalid",
    );
  });

  it("redirects to /auth/error when code is missing", async () => {
    const request = buildRequest("/auth/callback", { next: "/" });

    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "https://test.example.com/auth/error?reason=missing_code",
    );
  });

  it("redirects to /auth/error when env vars are missing", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const request = buildRequest("/auth/callback", { code: "some-code", next: "/" });

    const response = await GET(request);

    expect(response.headers.get("location")).toBe(
      "https://test.example.com/auth/error?reason=missing_code",
    );
  });

  it.each([
    { input: null, expected: "/" },
    { input: "//evil.com", expected: "/" },
    { input: "https://evil.com", expected: "/" },
    { input: "../trades", expected: "/" },
    { input: "/trades", expected: "/trades" },
    { input: "/trades?filter=active", expected: "/trades?filter=active" },
    { input: "", expected: "/" },
  ])("sanitises next param: $input → $expected", async ({ input, expected }) => {
    const params: Record<string, string> = { code: "valid-code" };
    if (input !== null) {
      params.next = input;
    }
    const request = buildRequest("/auth/callback", params);

    const response = await GET(request);

    const location = response.headers.get("location");
    expect(location).toBe(`https://test.example.com${expected}`);
  });
});
