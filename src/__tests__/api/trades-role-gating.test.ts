import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const queuedResults: { data: unknown; error: unknown }[] = [];
const builders: Record<string, unknown>[] = [];

function createBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  const chainMethods = [
    "select",
    "insert",
    "update",
    "eq",
    "is",
    "order",
    "range",
    "single",
    "maybeSingle",
    "limit",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve(queuedResults.shift()),
  );
  builders.push(builder);
  return builder;
}

const mockSupabase = {
  from: vi.fn().mockImplementation(() => createBuilder()),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-id-1" } },
      error: null,
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

const mockGetCurrentPortfolio = vi.fn();
vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () => mockGetCurrentPortfolio(),
}));

import { GET, POST } from "@/app/api/v1/trades/route";
import { PATCH, DELETE } from "@/app/api/v1/trades/[id]/route";

const OWNER = {
  portfolioId: "550e8400-e29b-41d4-a716-446655440000",
  role: "OWNER" as const,
  portfolio: { id: "p1", name: "Test", base_currency: "USD" as const },
};
const EDITOR = { ...OWNER, role: "EDITOR" as const };
const VIEWER = { ...OWNER, role: "VIEWER" as const };

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
});

describe("writeAccess gate on trade routes", () => {
  it("POST /api/v1/trades returns 403 for VIEWER", async () => {
    mockGetCurrentPortfolio.mockResolvedValue(VIEWER);
    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("POST /api/v1/trades proceeds for EDITOR (reaches validation, then 422)", async () => {
    mockGetCurrentPortfolio.mockResolvedValue(EDITOR);
    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    // No broker/broker_code is provided, so the route returns 422
    // (Zod parse error) — but importantly NOT 403.
    expect(response.status).toBe(422);
  });

  it("PATCH /api/v1/trades/:id returns 403 for VIEWER", async () => {
    mockGetCurrentPortfolio.mockResolvedValue(VIEWER);
    const request = new NextRequest(
      "http://localhost/api/v1/trades/550e8400-e29b-41d4-a716-446655440003",
      {
        method: "PATCH",
        body: JSON.stringify({ quantity: 20 }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440003" }),
    });
    expect(response.status).toBe(403);
  });

  it("DELETE /api/v1/trades/:id returns 403 for VIEWER", async () => {
    mockGetCurrentPortfolio.mockResolvedValue(VIEWER);
    const request = new NextRequest(
      "http://localhost/api/v1/trades/550e8400-e29b-41d4-a716-446655440003",
      { method: "DELETE" },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440003" }),
    });
    expect(response.status).toBe(403);
  });

  it("GET /api/v1/trades works for VIEWER (read is always allowed)", async () => {
    mockGetCurrentPortfolio.mockResolvedValue(VIEWER);
    queuedResults.push({ data: [], error: null });
    const request = new NextRequest("http://localhost/api/v1/trades");
    const response = await GET(request);
    expect(response.status).toBe(200);
  });
});
