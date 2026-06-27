import { describe, expect, it, vi, beforeEach } from "vitest";

// Capture the arguments passed to `unstable_cache` so the configuration test
// can assert on revalidate/tags. The wrapper is constructed per call (see
// implementation), so the test calls the function first to populate the
// capture.
const cacheCapture = vi.hoisted(() => ({
  fn: null as unknown,
  keys: null as unknown,
  options: null as { revalidate?: number; tags?: string[] } | unknown,
}));

// Build a fake service-role Supabase client whose query chain returns itself
// from every method except `maybeSingle`, which is the actual terminal and
// resolves to whatever the test queued.
const serviceSupabase = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {} as never;
  for (const m of ["select", "eq", "is", "order", "limit"]) {
    (chain as Record<string, ReturnType<typeof vi.fn>>)[m] = vi
      .fn()
      .mockReturnValue(chain);
  }
  const maybeSingle = vi.fn();
  (chain as Record<string, ReturnType<typeof vi.fn>>).maybeSingle = maybeSingle;
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain as Record<string, ReturnType<typeof vi.fn>>,
    _maybeSingle: maybeSingle,
  };
});

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: unknown,
    keys: unknown,
    options: { revalidate?: number; tags?: string[] },
  ) => {
    cacheCapture.fn = fn;
    cacheCapture.keys = keys;
    cacheCapture.options = options;
    return fn;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => serviceSupabase,
}));

import { fetchLatestTradeDate } from "./queries";

const PORTFOLIO_ID = "portfolio-xyz";

describe("fetchLatestTradeDate", () => {
  beforeEach(() => {
    // Clear call history only — implementations (mockReturnValue on the chain,
    // mockResolvedValue on maybeSingle) persist so each test only has to set
    // the return value it cares about.
    vi.clearAllMocks();
  });

  it("returns the ISO created_at when there are trades", async () => {
    const iso = "2026-06-20T10:00:00.000Z";
    serviceSupabase._maybeSingle.mockResolvedValue({
      data: { created_at: iso },
      error: null,
    });

    const result = await fetchLatestTradeDate("portfolio-1");

    expect(result).toBe(iso);
  });

  it("returns null when there are no trades for the portfolio", async () => {
    serviceSupabase._maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await fetchLatestTradeDate("portfolio-empty");

    expect(result).toBeNull();
  });

  it("throws when supabase returns an error", async () => {
    serviceSupabase._maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(fetchLatestTradeDate("portfolio-1")).rejects.toThrow(
      "permission denied",
    );
  });

  it("queries the trades table filtered by portfolio_id and active rows", async () => {
    serviceSupabase._maybeSingle.mockResolvedValue({
      data: { created_at: "2026-06-20T10:00:00.000Z" },
      error: null,
    });

    await fetchLatestTradeDate(PORTFOLIO_ID);

    expect(serviceSupabase.from).toHaveBeenCalledWith("trades");
    const chain = serviceSupabase._chain;
    expect(chain.select).toHaveBeenCalledWith("created_at");
    expect(chain.eq).toHaveBeenCalledWith("portfolio_id", PORTFOLIO_ID);
    expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(chain.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(serviceSupabase._maybeSingle).toHaveBeenCalled();
  });

  it("wraps the query with unstable_cache keyed by portfolioId with 30s revalidation and trades tags", async () => {
    serviceSupabase._maybeSingle.mockResolvedValue({
      data: { created_at: "2026-06-20T10:00:00.000Z" },
      error: null,
    });

    await fetchLatestTradeDate(PORTFOLIO_ID);

    const options = cacheCapture.options as
      | { revalidate?: number; tags?: string[] }
      | null;
    expect(options?.revalidate).toBe(30);
    expect(options?.tags).toBeDefined();
    expect(options?.tags).toContain("trades");
    expect(options?.tags).toContain(`trades:${PORTFOLIO_ID}`);

    const keys = cacheCapture.keys as unknown[] | null;
    expect(keys).toEqual(["latest-trade-date", PORTFOLIO_ID]);
  });
});
