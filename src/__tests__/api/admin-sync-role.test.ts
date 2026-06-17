import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const userSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-id-1" } },
      error: null,
    }),
  },
};

const serviceSupabase = {
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(userSupabase),
  createServiceSupabaseClient: () => serviceSupabase,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId: "p1",
      role: "VIEWER",
      portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" },
    }),
}));

import { POST } from "@/app/api/v1/admin/sync/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  serviceSupabase.rpc.mockReset();
});

describe("POST /api/v1/admin/sync/run role gate", () => {
  it("returns 403 when the caller is not an OWNER", async () => {
    const request = new NextRequest("http://localhost/api/v1/admin/sync/run", {
      method: "POST",
      body: JSON.stringify({ kind: "PRICES" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(serviceSupabase.rpc).not.toHaveBeenCalled();
  });
});
