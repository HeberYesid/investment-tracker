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

let currentRole: "OWNER" | "EDITOR" | "VIEWER" = "OWNER";

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(userSupabase),
  createServiceSupabaseClient: () => serviceSupabase,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId: "p1",
      role: currentRole,
      portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" },
    }),
}));

import { POST } from "@/app/api/v1/admin/sync/run/route";

beforeEach(() => {
  vi.clearAllMocks();
  userBuilder.rpc.mockReset();
  userSupabase.from.mockReset();
  serviceSupabase.rpc.mockReset();
  currentRole = "OWNER";
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
    expect(body.error.message).toBe("boom");
  });

  it("accepts PRICES_HISTORY kind and returns 202 with runId for OWNER", async () => {
    serviceSupabase.rpc.mockResolvedValue({
      data: "22222222-3333-4444-5555-666666666666",
      error: null,
    });
    const response = await POST(
      postSyncRequest({ kind: "PRICES_HISTORY" }) as NextRequest,
    );
    const body = await response.json();
    expect(response.status).toBe(202);
    expect(body.runId).toBe("22222222-3333-4444-5555-666666666666");
    expect(serviceSupabase.rpc).toHaveBeenCalledWith("enqueue_sync_run", {
      p_kind: "PRICES_HISTORY",
    });
  });

  it("returns 403 when caller is EDITOR", async () => {
    currentRole = "EDITOR";
    const response = await POST(
      postSyncRequest({ kind: "PRICES_HISTORY" }) as NextRequest,
    );
    expect(response.status).toBe(403);
    expect(serviceSupabase.rpc).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is VIEWER", async () => {
    currentRole = "VIEWER";
    const response = await POST(
      postSyncRequest({ kind: "PRICES_HISTORY" }) as NextRequest,
    );
    expect(response.status).toBe(403);
    expect(serviceSupabase.rpc).not.toHaveBeenCalled();
  });
});
