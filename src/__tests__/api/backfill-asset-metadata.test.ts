import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

const mockFetchProfile = vi.fn();
const mockFetchProfileWithCandidates = vi.fn();
const mockProvider = {
  fetchProfile: mockFetchProfile,
  fetchProfileWithCandidates: mockFetchProfileWithCandidates,
};

vi.mock("@/lib/market-data/yahoo", () => ({
  createYahooProvider: () => mockProvider,
}));

const userSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-id-1" } },
      error: null,
    }),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createUserSupabaseClient: () => Promise.resolve(userSupabase),
  createServiceSupabaseClient: () => userSupabase,
}));

type MockBuilder = Record<string, Mock>;

let portfolioRole: "OWNER" | "VIEWER" = "OWNER";

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId: "p1",
      role: portfolioRole,
      portfolio: { id: "p1", name: "Mi portafolio", base_currency: "USD" },
    }),
}));

import { POST } from "@/app/api/v1/admin/backfill-asset-metadata/route";

function makeBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  for (const method of [
    "select", "insert", "update", "eq", "is", "in",
    "order", "range", "single", "maybeSingle", "limit", "gte", "lte",
  ]) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  return builder;
}

function callPost(body: Record<string, unknown> = {}) {
  const request = new NextRequest(
    "http://localhost/api/v1/admin/backfill-asset-metadata",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return POST(request);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchProfile.mockReset();
  mockFetchProfileWithCandidates.mockReset();
  portfolioRole = "OWNER";
});

describe("POST /api/v1/admin/backfill-asset-metadata", () => {
  it("returns 403 when the caller is not an OWNER", async () => {
    portfolioRole = "VIEWER";
    const response = await callPost();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mockFetchProfile).not.toHaveBeenCalled();
  });

  it("returns 422 on invalid input (negative limit)", async () => {
    const response = await callPost({ limit: -1 });
    expect(response.status).toBe(422);
  });

  it("returns 422 on invalid input (limit > 50)", async () => {
    const response = await callPost({ limit: 100 });
    expect(response.status).toBe(422);
  });

  it("returns 200 with all zeros when there are no assets to backfill", async () => {
    const builder = makeBuilder();
    builder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: [], count: 0, error: null }),
    );
    userSupabase.from.mockReturnValueOnce(builder);

    const response = await callPost();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(body.succeeded).toBe(0);
    expect(body.notFound).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.tickers).toEqual([]);
    expect(body.nextOffset).toBeNull();
    expect(mockFetchProfileWithCandidates).not.toHaveBeenCalled();
  });

  it("calls fetchProfileWithCandidates for each asset and updates those with a profile", async () => {
    const assets = [
      { id: "asset-aapl", ticker: "AAPL", yahoo_symbol: null, currency: "USD" },
      { id: "asset-nvda", ticker: "NVDA", yahoo_symbol: null, currency: "USD" },
    ];
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: assets, count: 2, error: null }),
    );
    const updateAaplBuilder = makeBuilder();
    updateAaplBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );
    const updateNvdaBuilder = makeBuilder();
    updateNvdaBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );

    userSupabase.from
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateAaplBuilder)
      .mockReturnValueOnce(updateNvdaBuilder);

    mockFetchProfileWithCandidates.mockImplementation(
      async (candidates: string[]) => {
        if (candidates[0] === "AAPL" || candidates[0] === "NVDA") {
          return {
            status: "ok",
            profile: { sector: "Technology", country: "United States" },
            resolvedSymbol: candidates[0],
          };
        }
        return { status: "not_found" };
      },
    );

    const response = await callPost();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(2);
    expect(body.succeeded).toBe(2);
    expect(body.notFound).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.nextOffset).toBe(null);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledTimes(2);

    expect(updateAaplBuilder.update).toHaveBeenCalledWith({
      sector: "Technology",
      country: "United States",
    });
    expect(updateAaplBuilder.eq).toHaveBeenCalledWith("id", "asset-aapl");
  });

  it("reports per-ticker outcomes (succeeded vs not_found vs error)", async () => {
    const assets = [
      { id: "asset-aapl", ticker: "AAPL", yahoo_symbol: null, currency: "USD" },
      { id: "asset-btc", ticker: "BTC-USD", yahoo_symbol: null, currency: "USD" },
      { id: "asset-bad", ticker: "BAD", yahoo_symbol: null, currency: "USD" },
    ];
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: assets, count: 3, error: null }),
    );
    const updateBuilder = makeBuilder();
    updateBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );
    userSupabase.from
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder);

    mockFetchProfileWithCandidates.mockImplementation(
      async (candidates: string[]) => {
        const t = candidates[0];
        if (t === "AAPL") {
          return {
            status: "ok",
            profile: { sector: "Technology", country: "United States" },
            resolvedSymbol: "AAPL",
          };
        }
        if (t === "BTC-USD") {
          return { status: "not_found" };
        }
        return { status: "error", message: "rate_limited" };
      },
    );

    const response = await callPost();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(3);
    expect(body.succeeded).toBe(1);
    expect(body.notFound).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.tickers).toHaveLength(3);
    const byTicker = Object.fromEntries(
      body.tickers.map((t: { ticker: string; status: string }) => [t.ticker, t.status]),
    );
    expect(byTicker.AAPL).toBe("succeeded");
    expect(byTicker["BTC-USD"]).toBe("not_found");
    expect(byTicker.BAD).toBe("error");
  });

  it("tries .CO as a candidate for COP-denominated tickers", async () => {
    const assets = [
      { id: "asset-eco", ticker: "ECOPETROL", yahoo_symbol: null, currency: "COP" },
    ];
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: assets, count: 1, error: null }),
    );
    const updateBuilder = makeBuilder();
    updateBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );
    userSupabase.from
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder);

    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Energy", country: "Colombia" },
      resolvedSymbol: "ECOPETROL.CO",
    });

    const response = await callPost();
    expect(response.status).toBe(200);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledWith([
      "ECOPETROL",
      "ECOPETROL.CO",
    ]);
  });

  it("returns nextOffset and totalRemaining for paginated results", async () => {
    const assets = [
      { id: "asset-1", ticker: "AAPL", yahoo_symbol: null, currency: "USD" },
      { id: "asset-2", ticker: "NVDA", yahoo_symbol: null, currency: "USD" },
    ];
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: assets, count: 10, error: null }),
    );
    const update1 = makeBuilder();
    update1.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );
    const update2 = makeBuilder();
    update2.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );

    userSupabase.from
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(update1)
      .mockReturnValueOnce(update2);

    mockFetchProfileWithCandidates.mockResolvedValue({
      status: "ok",
      profile: { sector: "Tech", country: "US" },
      resolvedSymbol: "AAPL",
    });

    const response = await callPost({ offset: 4, limit: 2 });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(2);
    expect(body.succeeded).toBe(2);
    expect(body.nextOffset).toBe(6);
    expect(body.totalRemaining).toBe(4);
  });

  it("only updates the assets that match the filter (sector IS NULL AND country IS NULL)", async () => {
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: [], count: 0, error: null }),
    );
    userSupabase.from.mockReturnValueOnce(selectBuilder);

    await callPost();
    const selectCall = selectBuilder.select.mock.calls[0];
    const selectArgs = selectCall[1] as { count?: string };
    expect(selectArgs?.count).toBe("exact");
    expect(selectBuilder.is).toHaveBeenCalledWith("sector", null);
    expect(selectBuilder.is).toHaveBeenCalledWith("country", null);
    const orderCalls = selectBuilder.order.mock.calls;
    expect(orderCalls).toHaveLength(1);
    expect(orderCalls[0][0]).toBe("id");
    const orderOpts = orderCalls[0][1] as { ascending?: boolean };
    expect(orderOpts?.ascending).toBe(true);
    const orderColumnNames = orderCalls.map((call) => call[0]);
    expect(orderColumnNames).not.toContain("created_at");
  });

  it("survives fetchProfileWithCandidates throwing for a single asset", async () => {
    const assets = [
      { id: "asset-aapl", ticker: "AAPL", yahoo_symbol: null, currency: "USD" },
      { id: "asset-btc", ticker: "BTC-USD", yahoo_symbol: null, currency: "USD" },
    ];
    const selectBuilder = makeBuilder();
    selectBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: assets, count: 2, error: null }),
    );
    const updateBuilder = makeBuilder();
    updateBuilder.then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
    );
    userSupabase.from
      .mockReturnValueOnce(selectBuilder)
      .mockReturnValueOnce(updateBuilder);

    mockFetchProfileWithCandidates.mockImplementation(
      async (candidates: string[]) => {
        if (candidates[0] === "AAPL") {
          return {
            status: "ok",
            profile: { sector: "Tech", country: "US" },
            resolvedSymbol: "AAPL",
          };
        }
        throw new Error("network boom");
      },
    );

    const response = await callPost();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(2);
    expect(body.succeeded).toBe(1);
    expect(body.failed).toBe(1);
  });
});
