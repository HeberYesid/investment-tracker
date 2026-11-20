import { afterEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  rpc: vi.fn(),
};

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(mockSupabase),
  createServiceSupabaseClient: () => mockSupabase,
}));

import { getCurrentPortfolio, getCurrentUser } from "@/lib/supabase/auth";
import { requireApiUser } from "@/lib/api/auth";

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns the supabase user when authenticated", async () => {
    const user = { id: "u1" };
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });

    const result = await getCurrentUser();

    expect(result).toEqual(user);
  });

  it("returns null when no user is signed in", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const result = await getCurrentUser();

    expect(result).toBeNull();
  });
});

describe("getCurrentPortfolio", () => {
  it("returns the user's only portfolio and OWNER role", async () => {
    const id = "20000000-0000-4000-8000-000000000001";
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "u1" } },
      error: null,
    });
    const member = {
      portfolio_id: id,
      role: "OWNER",
      name: "Mi portafolio",
      base_currency: "USD",
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: [member], error: null });

    const result = await getCurrentPortfolio();

    expect(result).toEqual({
      portfolioId: id,
      role: "OWNER",
      portfolio: { id, name: "Mi portafolio", base_currency: "USD" },
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith("list_my_portfolio_memberships");
  });

  it("returns null when the user has no portfolio membership", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null });

    const result = await getCurrentPortfolio();

    expect(result).toBeNull();
  });

  it("returns null when there is no user", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const result = await getCurrentPortfolio();

    expect(result).toBeNull();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });
});

describe("requireApiUser", () => {
  it("returns the user and a supabase client when authenticated", async () => {
    const user = { id: "u1" };
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });

    const result = await requireApiUser();

    expect(result.response).toBeNull();
    expect(result.user).toEqual(user);
    expect(result.supabase).toBe(mockSupabase);
  });

  it("returns a 401 response when no user is signed in", async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const result = await requireApiUser();

    expect(result.user).toBeNull();
    expect(result.supabase).toBeNull();
    expect(result.response).not.toBeNull();
    expect(result.response!.status).toBe(401);
    const body = await result.response!.json();
    expect(body).toEqual({
      error: { code: "UNAUTHORIZED", message: "No autenticado." },
    });
  });
});
