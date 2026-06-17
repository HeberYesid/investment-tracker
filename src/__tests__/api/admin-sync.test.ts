import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

type MockBuilder = Record<string, Mock>;

const userBuilder: MockBuilder = {
  rpc: vi.fn(),
};

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
      role: "OWNER",
      portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" },
    }),
}));

import { POST } from "@/app/api/v1/admin/sync/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  userBuilder.rpc.mockReset();
  userSupabase.from.mockReset();
  serviceSupabase.rpc.mockReset();
});

function postSyncRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/sync/run", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/v1/admin/sync/run", () => {
  it("returns 422 when body is invalid", async () => {
    const response = await POST(
      postSyncRequest({ kind: "INVALID" }) as NextRequest,
    );
    expect(response.status).toBe(422);
  });

  it("returns 400 when body is not JSON", async () => {
    const request = new NextRequest("http://localhost/api/v1/admin/sync/run", {
      method: "POST",
      body: "not-json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("calls enqueue_sync_run via the service client and returns 202 with runId", async () => {
    serviceSupabase.rpc.mockResolvedValue({
      data: "11111111-2222-3333-4444-555555555555",
      error: null,
    });
    const response = await POST(
      postSyncRequest({ kind: "PRICES" }) as NextRequest,
    );
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body.runId).toBe("11111111-2222-3333-4444-555555555555");
    expect(serviceSupabase.rpc).toHaveBeenCalledWith("enqueue_sync_run", {
      p_kind: "PRICES",
    });
  });

  it("returns 400 when the RPC reports an error", async () => {
    serviceSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const response = await POST(
      postSyncRequest({ kind: "FX" }) as NextRequest,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("boom");
  });
});
