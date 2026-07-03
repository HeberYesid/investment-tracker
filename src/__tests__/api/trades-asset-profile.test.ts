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

const mockTrade = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  portfolio_id: "550e8400-e29b-41d4-a716-446655440000",
  broker_id: "550e8400-e29b-41d4-a716-446655440001",
  asset_id: "550e8400-e29b-41d4-a716-446655440002",
  trade_date: "2024-01-15",
  trade_type: "BUY",
  quantity: 10,
  price_original: 100,
  currency_original: "USD",
  commission_original: 5,
  fx_rate_to_usd: 1,
  price_usd: 100,
  commission_usd: 5,
  total_invested_usd: 1005,
  source: "MANUAL",
  source_file_id: null,
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
  deleted_at: null,
};

type MockBuilder = Record<string, Mock>;

const queuedResults: Record<string, unknown>[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select", "insert", "update", "eq", "is",
    "order", "range", "single", "maybeSingle", "limit", "gte", "lte",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve(queuedResults.shift()));
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
  createServiceSupabaseClient: () => mockSupabase,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId: "550e8400-e29b-41d4-a716-446655440000",
      role: "OWNER",
      portfolio: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Mi portafolio",
        base_currency: "USD",
      },
    }),
}));

import { POST } from "@/app/api/v1/trades/route";

const validTradeInput = {
  trade_date: "2024-01-15",
  trade_type: "BUY",
  broker_code: "ETORO",
  ticker: "AAPL",
  quantity: 10,
  price_original: 100,
  currency_original: "USD",
  commission_original: 5,
  fx_rate_to_usd: 1,
};

function postTrade() {
  const request = new NextRequest("http://localhost/api/v1/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validTradeInput),
  });
  return POST(request);
}

function findUpdatePayload(predicate: (payload: unknown) => boolean): unknown {
  for (const builder of builders as MockBuilder[]) {
    for (const call of builder.update.mock.calls) {
      if (call && predicate(call[0])) return call[0];
    }
  }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
  mockFetchProfile.mockReset();
  mockFetchProfileWithCandidates.mockReset();
});

describe("POST /api/v1/trades — asset profile enrichment", () => {
  it("persists sector and country on a newly created asset when Yahoo returns a profile", async () => {
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: "United States" },
      resolvedSymbol: "AAPL",
    });

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postTrade();
    expect(response.status).toBe(201);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledWith(["AAPL"]);

    const updatePayload = findUpdatePayload(
      (payload) =>
        payload !== null &&
        typeof payload === "object" &&
        "sector" in (payload as Record<string, unknown>),
    );
    expect(updatePayload).toEqual({
      sector: "Technology",
      country: "United States",
    });
  });

  it("does not call Yahoo or update the asset when the ticker already exists", async () => {
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: "United States" },
      resolvedSymbol: "AAPL",
    });

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postTrade();
    expect(response.status).toBe(201);
    expect(mockFetchProfileWithCandidates).not.toHaveBeenCalled();

    const updatePayload = findUpdatePayload(
      (payload) =>
        payload !== null &&
        typeof payload === "object" &&
        "sector" in (payload as Record<string, unknown>),
    );
    expect(updatePayload).toBeUndefined();
  });

  it("creates the trade with no sector/country update when Yahoo returns not_found", async () => {
    mockFetchProfileWithCandidates.mockResolvedValueOnce({ status: "not_found" });

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postTrade();
    expect(response.status).toBe(201);

    const updatePayload = findUpdatePayload(
      (payload) =>
        payload !== null &&
        typeof payload === "object" &&
        ("sector" in (payload as Record<string, unknown>) ||
          "country" in (payload as Record<string, unknown>)),
    );
    expect(updatePayload).toBeUndefined();
  });

  it("only writes the fields Yahoo actually returned", async () => {
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: null },
      resolvedSymbol: "AAPL",
    });

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postTrade();
    expect(response.status).toBe(201);

    const updatePayload = findUpdatePayload(
      (payload) =>
        payload !== null &&
        typeof payload === "object" &&
        "sector" in (payload as Record<string, unknown>),
    );
    expect(updatePayload).toEqual({ sector: "Technology" });
  });

  it("still creates the trade even if fetchProfileWithCandidates throws unexpectedly", async () => {
    mockFetchProfileWithCandidates.mockRejectedValueOnce(
      new Error("network boom"),
    );

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postTrade();
    expect(response.status).toBe(201);
  });

  it("includes the .CO suffix as a candidate for COP-denominated tickers", async () => {
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Energy", country: "Colombia" },
      resolvedSymbol: "ECOPETROL.CO",
    });

    const copInput = {
      ...validTradeInput,
      currency_original: "COP",
      fx_rate_to_usd: 0.00025,
    };
    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...copInput, ticker: "ECOPETROL" }),
    });

    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledWith([
      "ECOPETROL",
      "ECOPETROL.CO",
    ]);
  });
});
