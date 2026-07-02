import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireApiUserMock = vi.fn();
const getCurrentPortfolioMock = vi.fn();
const serviceRpcMock = vi.fn();
const createServiceSupabaseClientMock = vi.fn(() => ({ rpc: serviceRpcMock }));

vi.mock("@/lib/api/auth", () => ({
  requireApiUser: () => requireApiUserMock(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () => getCurrentPortfolioMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => createServiceSupabaseClientMock(),
}));

import { POST } from "./route";

function buildRequest(body: unknown, raw = false): NextRequest {
  const payload = raw ? String(body) : JSON.stringify(body);
  return new NextRequest("http://localhost/api/v1/admin/sync/run", {
    method: "POST",
    body: payload,
  });
}

const OWNER_PORTFOLIO = {
  portfolioId: "p1",
  role: "OWNER" as const,
  portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" as const },
};

describe("POST /api/v1/admin/sync/run", () => {
  beforeEach(() => {
    requireApiUserMock.mockReset();
    getCurrentPortfolioMock.mockReset();
    serviceRpcMock.mockReset();
    createServiceSupabaseClientMock.mockClear();
  });

  it("returns 401 when no authenticated user", async () => {
    requireApiUserMock.mockResolvedValue({
      user: null,
      supabase: null,
      response: new Response(
        JSON.stringify({ error: { code: "UNAUTHORIZED", message: "No autenticado." } }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    });

    const response = await POST(buildRequest({ kind: "PRICES" }));
    expect(response.status).toBe(401);
    expect(serviceRpcMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });

    const response = await POST(buildRequest("not-json", true));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 422 when kind is not in the allowed enum", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });

    const response = await POST(buildRequest({ kind: "INVALID" }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when the user has no portfolio", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });
    getCurrentPortfolioMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ kind: "PRICES_HISTORY" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toMatch(/portafolio/i);
  });

  it("returns 403 when the portfolio role is not OWNER", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });
    getCurrentPortfolioMock.mockResolvedValue({ ...OWNER_PORTFOLIO, role: "EDITOR" });

    const response = await POST(buildRequest({ kind: "FX" }));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(serviceRpcMock).not.toHaveBeenCalled();
  });

  it("returns 202 with runId when the OWNER triggers a sync", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });
    getCurrentPortfolioMock.mockResolvedValue(OWNER_PORTFOLIO);
    serviceRpcMock.mockResolvedValue({ data: "run-abc-123", error: null });

    const response = await POST(buildRequest({ kind: "PRICES" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ runId: "run-abc-123" });
    expect(serviceRpcMock).toHaveBeenCalledWith("enqueue_sync_run", {
      p_kind: "PRICES",
    });
  });

  it("returns 400 when the rpc call returns an error message", async () => {
    requireApiUserMock.mockResolvedValue({
      user: { id: "u1" } as never,
      supabase: {} as never,
      response: null,
    });
    getCurrentPortfolioMock.mockResolvedValue(OWNER_PORTFOLIO);
    serviceRpcMock.mockResolvedValue({ data: null, error: { message: "queue down" } });

    const response = await POST(buildRequest({ kind: "PRICES" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toBe("queue down");
  });
});
