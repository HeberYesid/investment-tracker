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

const importId = "11111111-1111-4111-8111-111111111111";
const portfolioId = "550e8400-e29b-41d4-a716-446655440000";
const brokerId = "550e8400-e29b-41d4-a716-446655440001";

const importRecord = {
  id: importId,
  portfolio_id: portfolioId,
  broker_id: brokerId,
  status: "PENDING",
  file_name: "eToro-2024.csv",
  broker_code: "ETORO",
  created_at: "2024-01-15T10:00:00Z",
};

type MockBuilder = Record<string, Mock>;

const queuedResults: Record<string, unknown>[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select", "insert", "update", "eq", "is", "in",
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
  unstable_cache: (cb: unknown) => cb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId,
      role: "OWNER",
      portfolio: {
        id: portfolioId,
        name: "Mi portafolio",
        base_currency: "USD",
      },
    }),
}));

import { POST } from "@/app/api/v1/imports/csv/commit/route";

function buildValidRow(rowNumber: number, ticker: string) {
  return {
    id: `row-${rowNumber}`,
    import_id: importId,
    row_number: rowNumber,
    validation_status: "VALID",
    parsed_data_json: {
      ticker,
      trade_date: "2024-01-15",
      trade_type: "BUY",
      quantity: 10,
      price_original: 100,
      currency_original: "USD",
      commission_original: 5,
      fx_rate_to_usd: 1,
    },
  };
}

function postCommit() {
  const request = new NextRequest(
    "http://localhost/api/v1/imports/csv/commit",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ import_id: importId }),
    },
  );
  return POST(request);
}

function findInsertCall(
  table: string,
  predicate: (payload: unknown) => boolean,
): { payload: unknown; builder: MockBuilder } | undefined {
  const tableCalls = (mockSupabase.from.mock.calls as unknown as string[][])
    .map((args) => args[0])
    .map((name, idx) => ({ name, idx }))
    .filter((entry) => entry.name === table);
  for (const { idx } of tableCalls) {
    const builder = builders[idx];
    for (const insertCall of builder.insert.mock.calls) {
      const arg = insertCall[0];
      if (Array.isArray(arg)) {
        const match = arg.find(predicate);
        if (match) return { payload: match, builder };
      } else if (predicate(arg)) {
        return { payload: arg, builder };
      }
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

function setupHappyPathQueue() {
  queuedResults.push({ data: importRecord, error: null });
  queuedResults.push({
    data: [buildValidRow(1, "AAPL"), buildValidRow(2, "AAPL")],
    error: null,
  });
  queuedResults.push({ data: [], error: null });
  queuedResults.push({ data: [{ id: "asset-aapl", ticker: "AAPL" }], error: null });
  queuedResults.push({ data: null, error: null });
  queuedResults.push({ data: null, error: null });
}

describe("POST /api/v1/imports/csv/commit — asset profile enrichment", () => {
  it("deduplicates ticker lookups: N rows of the same ticker result in one Yahoo call", async () => {
    setupHappyPathQueue();
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: "United States" },
      resolvedSymbol: "AAPL",
    });

    const response = await postCommit();
    expect(response.status).toBe(200);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledTimes(1);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledWith(["AAPL"]);
  });

  it("persists sector and country on the new asset insert", async () => {
    setupHappyPathQueue();
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: "United States" },
      resolvedSymbol: "AAPL",
    });

    const response = await postCommit();
    expect(response.status).toBe(200);

    const insert = findInsertCall("assets", (payload) => {
      return (
        payload !== null &&
        typeof payload === "object" &&
        "ticker" in (payload as Record<string, unknown>) &&
        (payload as Record<string, unknown>).ticker === "AAPL"
      );
    });
    expect(insert).toBeDefined();
    expect(insert!.payload).toEqual({
      ticker: "AAPL",
      asset_type: "STOCK",
      currency: "USD",
      name: "AAPL",
      sector: "Technology",
      country: "United States",
    });
  });

  it("skips Yahoo entirely when all tickers are already in the assets table", async () => {
    queuedResults.push({ data: importRecord, error: null });
    queuedResults.push({
      data: [buildValidRow(1, "AAPL"), buildValidRow(2, "AAPL")],
      error: null,
    });
    queuedResults.push({ data: [{ id: "asset-aapl", ticker: "AAPL" }], error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postCommit();
    expect(response.status).toBe(200);
    expect(mockFetchProfileWithCandidates).not.toHaveBeenCalled();
  });

  it("inserts without sector/country when Yahoo returns not_found", async () => {
    setupHappyPathQueue();
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "not_found",
    });

    const response = await postCommit();
    expect(response.status).toBe(200);

    const insert = findInsertCall("assets", (payload) => {
      return (
        payload !== null &&
        typeof payload === "object" &&
        "ticker" in (payload as Record<string, unknown>) &&
        (payload as Record<string, unknown>).ticker === "AAPL"
      );
    });
    expect(insert).toBeDefined();
    const payload = insert!.payload as Record<string, unknown>;
    expect(payload.ticker).toBe("AAPL");
    expect(payload.sector).toBeUndefined();
    expect(payload.country).toBeUndefined();
  });

  it("only writes the fields Yahoo actually returned", async () => {
    setupHappyPathQueue();
    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Technology", country: null },
      resolvedSymbol: "AAPL",
    });

    const response = await postCommit();
    expect(response.status).toBe(200);

    const insert = findInsertCall("assets", (payload) => {
      return (
        payload !== null &&
        typeof payload === "object" &&
        "ticker" in (payload as Record<string, unknown>) &&
        (payload as Record<string, unknown>).ticker === "AAPL"
      );
    });
    expect(insert).toBeDefined();
    expect(insert!.payload).toMatchObject({
      ticker: "AAPL",
      sector: "Technology",
    });
    expect(
      (insert!.payload as Record<string, unknown>).country,
    ).toBeUndefined();
  });

  it("does not call Yahoo for tickers that already exist", async () => {
    queuedResults.push({ data: importRecord, error: null });
    queuedResults.push({
      data: [
        buildValidRow(1, "AAPL"),
        buildValidRow(2, "NVDA"),
        buildValidRow(3, "AAPL"),
      ],
      error: null,
    });
    queuedResults.push({
      data: [
        { id: "asset-aapl", ticker: "AAPL" },
        { id: "asset-nvda", ticker: "NVDA" },
      ],
      error: null,
    });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });

    const response = await postCommit();
    expect(response.status).toBe(200);
    expect(mockFetchProfileWithCandidates).not.toHaveBeenCalled();
  });

  it("survives fetchProfileWithCandidates throwing for one ticker (other tickers still get inserted)", async () => {
    queuedResults.push({ data: importRecord, error: null });
    queuedResults.push({
      data: [buildValidRow(1, "AAPL"), buildValidRow(2, "NVDA")],
      error: null,
    });
    queuedResults.push({ data: [], error: null });
    queuedResults.push({
      data: [
        { id: "asset-aapl", ticker: "AAPL" },
        { id: "asset-nvda", ticker: "NVDA" },
      ],
      error: null,
    });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });
    mockFetchProfileWithCandidates.mockImplementation(
      async (candidates: string[]) => {
        if (candidates[0] === "AAPL") {
          throw new Error("network boom");
        }
        return {
          status: "ok",
          profile: { sector: "Technology", country: "United States" },
          resolvedSymbol: "NVDA",
        };
      },
    );

    const response = await postCommit();
    expect(response.status).toBe(200);

    const aaplInsert = findInsertCall("assets", (payload) => {
      return (
        payload !== null &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).ticker === "AAPL"
      );
    });
    const nvdaInsert = findInsertCall("assets", (payload) => {
      return (
        payload !== null &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).ticker === "NVDA"
      );
    });
    expect(aaplInsert).toBeDefined();
    expect(nvdaInsert).toBeDefined();
    expect(
      (aaplInsert!.payload as Record<string, unknown>).sector,
    ).toBeUndefined();
    expect(
      (nvdaInsert!.payload as Record<string, unknown>).sector,
    ).toBe("Technology");
  });

  it("passes .CO as a candidate for COP-denominated tickers", async () => {
    queuedResults.push({ data: importRecord, error: null });
    queuedResults.push({
      data: [
        { ...buildValidRow(1, "ECOPETROL"), parsed_data_json: {
          ...buildValidRow(1, "ECOPETROL").parsed_data_json,
          currency_original: "COP",
        } },
      ],
      error: null,
    });
    queuedResults.push({ data: [], error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: { id: "asset-eco" }, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });

    mockFetchProfileWithCandidates.mockResolvedValueOnce({
      status: "ok",
      profile: { sector: "Energy", country: "Colombia" },
      resolvedSymbol: "ECOPETROL.CO",
    });

    const response = await postCommit();
    expect(response.status).toBe(200);
    expect(mockFetchProfileWithCandidates).toHaveBeenCalledWith([
      "ECOPETROL",
      "ECOPETROL.CO",
    ]);
  });
});
