import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

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

import { GET, POST } from "@/app/api/v1/trades/route";
import { PATCH, DELETE } from "@/app/api/v1/trades/[id]/route";

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

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
});

describe("POST /api/v1/trades", () => {
  it("returns 201 for a valid trade", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual(mockTrade);
  });

  it("returns 422 for invalid data (missing required fields)", async () => {
    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade_type: "BUY" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
  });

  it("returns 422 for COP without a valid FX rate", async () => {
    const copInput = { ...validTradeInput, currency_original: "COP", fx_rate_to_usd: 1 };

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copInput),
    });

    const response = await POST(request);

    expect(response.status).toBe(422);
  });

  it("computes USD values correctly", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    await POST(request);

    const tradesBuilder = builders[2];
    const insertedPayload = tradesBuilder.insert.mock.calls[0][0];

    expect(insertedPayload.price_usd).toBe(100);
    expect(insertedPayload.commission_usd).toBe(5);
    expect(insertedPayload.total_invested_usd).toBe(1005);
  });

  it("creates an audit event after trade creation", async () => {
    queuedResults.push({ data: { id: mockTrade.broker_id }, error: null });
    queuedResults.push({ data: { id: mockTrade.asset_id }, error: null });
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest("http://localhost/api/v1/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTradeInput),
    });

    await POST(request);

    expect(mockSupabase.from).toHaveBeenCalledWith("audit_events");
    const auditBuilder = builders[3];
    const auditPayload = auditBuilder.insert.mock.calls[0][0];

    expect(auditPayload.entity_type).toBe("trade");
    expect(auditPayload.entity_id).toBe(mockTrade.id);
    expect(auditPayload.action).toBe("CREATE");
    expect(auditPayload.after_json).toEqual(mockTrade);
  });
});

describe("GET /api/v1/trades", () => {
  it("returns a paginated list of trades with ticker and broker", async () => {
    queuedResults.push({
      data: [
        {
          ...mockTrade,
          assets: { ticker: "AAPL", name: "Apple Inc" },
          brokers: { name: "eToro", code: "ETORO" },
        },
      ],
      error: null,
      count: 1,
    });

    const request = new NextRequest("http://localhost/api/v1/trades?page=1&limit=20");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].ticker).toBe("AAPL");
    expect(body.data[0].asset_name).toBe("Apple Inc");
    expect(body.data[0].broker_name).toBe("eToro");
    expect(body.data[0].broker_code).toBe("ETORO");
    expect(body.data[0].assets).toBeUndefined();
    expect(body.data[0].brokers).toBeUndefined();
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it("returns an empty list when no trades exist", async () => {
    queuedResults.push({ data: [], error: null, count: 0 });

    const request = new NextRequest("http://localhost/api/v1/trades?page=1&limit=20");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});

describe("PATCH /api/v1/trades/:id", () => {
  const tradeId = "550e8400-e29b-41d4-a716-446655440003";

  it("returns 200 for a valid partial update", async () => {
    const updatedTrade = { ...mockTrade, quantity: 20, updated_at: expect.any(String) };
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: updatedTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quantity).toBe(20);
  });

  it("returns 404 for a non-existent trade", async () => {
    queuedResults.push({ data: null, error: { message: "Not found" } });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: 20 }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(404);
  });

  it("recomputes USD values when price_original changes", async () => {
    const updatedTrade = {
      ...mockTrade,
      price_original: 200,
      price_usd: 200,
      commission_usd: 5,
      total_invested_usd: 2005,
    };
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: updatedTrade, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_original: 200 }),
    });

    await PATCH(request, { params: Promise.resolve({ id: tradeId }) });

    const updateBuilder = builders[1];
    const updatePayload = updateBuilder.update.mock.calls[0][0];

    expect(updatePayload.price_usd).toBe(200);
    expect(updatePayload.commission_usd).toBe(5);
    expect(updatePayload.total_invested_usd).toBe(2005);
  });
});

describe("DELETE /api/v1/trades/:id", () => {
  const tradeId = "550e8400-e29b-41d4-a716-446655440003";

  it("returns 204 and sets deleted_at", async () => {
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(204);

    const deleteBuilder = builders[1];
    const updatePayload = deleteBuilder.update.mock.calls[0][0];
    expect(updatePayload.deleted_at).toBeDefined();
  });

  it("returns 404 for a non-existent trade", async () => {
    queuedResults.push({ data: null, error: { message: "Not found" } });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(response.status).toBe(404);
  });

  it("creates an audit event after deletion", async () => {
    queuedResults.push({ data: mockTrade, error: null });
    queuedResults.push({ data: null, error: null });
    queuedResults.push({ data: null, error: null });

    const request = new NextRequest(`http://localhost/api/v1/trades/${tradeId}`, {
      method: "DELETE",
    });

    await DELETE(request, { params: Promise.resolve({ id: tradeId }) });

    expect(mockSupabase.from).toHaveBeenCalledWith("audit_events");
    const auditBuilder = builders[2];
    const auditPayload = auditBuilder.insert.mock.calls[0][0];

    expect(auditPayload.entity_type).toBe("trade");
    expect(auditPayload.entity_id).toBe(mockTrade.id);
    expect(auditPayload.action).toBe("DELETE");
    expect(auditPayload.before_json).toEqual(mockTrade);
  });
});
