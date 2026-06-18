import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

type MockBuilder = Record<string, Mock>;

const queuedResults: Record<string, unknown>[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select", "insert", "update", "eq", "is",
    "order", "range", "single", "maybeSingle", "limit", "gte", "lte", "in",
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
  rpc: vi.fn().mockImplementation(() => Promise.resolve(queuedResults.shift())),
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
  unstable_cache: (cb: unknown) => cb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  getCurrentPortfolio: () =>
    Promise.resolve({
      portfolioId: "p1",
      role: "OWNER",
      portfolio: {
        id: "p1",
        name: "Mi portafolio",
        base_currency: "USD",
      },
    }),
}));

import { GET as summaryGET } from "@/app/api/v1/dashboard/summary/route";
import { GET as distributionGET } from "@/app/api/v1/dashboard/distribution/route";
import { GET as evolutionGET } from "@/app/api/v1/dashboard/evolution/route";
import { GET as returnsGET } from "@/app/api/v1/dashboard/returns/route";

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
});

function pushTrades(rows: unknown[] = []) {
  queuedResults.push({ data: rows, error: null });
}

function pushPrices(rows: unknown[] = []) {
  queuedResults.push({ data: rows, error: null });
}

describe("GET /api/v1/dashboard/summary", () => {
  it("returns 422 on invalid query params", async () => {
    const request = new NextRequest("http://localhost/api/v1/dashboard/summary?portfolio_id=not-a-uuid");
    const response = await summaryGET(request);
    expect(response.status).toBe(422);
  });

  it("returns 200 with summary shape for a portfolio with one BUY", async () => {
    pushTrades([
      {
        asset_id: "a1",
        broker_id: "b1",
        trade_type: "BUY",
        quantity: 10,
        price_usd: 100,
        commission_usd: 0,
        total_invested_usd: 1000,
        deleted_at: null,
        assets: { ticker: "AAPL", name: "Apple", sector: null, country: null },
        brokers: { code: "ETORO", name: "eToro" },
      },
    ]);
    pushPrices([]);

    const request = new NextRequest("http://localhost/api/v1/dashboard/summary");
    const response = await summaryGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      equityUsd: 1000,
      investedUsd: 1000,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      totalPnlUsd: 0,
      returnPct: 0,
      holdingsCount: 1,
      isEstimated: true,
      isAnyStale: false,
    });
  });

  it("returns isAnyStale true when a quote is older than 2h", async () => {
    const now = Date.now();
    const oldDate = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    pushTrades([
      {
        asset_id: "a1",
        broker_id: "b1",
        trade_type: "BUY",
        quantity: 10,
        price_usd: 100,
        commission_usd: 0,
        total_invested_usd: 1000,
        deleted_at: null,
        assets: { ticker: "AAPL", name: "Apple", sector: null, country: null },
        brokers: { code: "ETORO", name: "eToro" },
      },
    ]);
    pushPrices([
      {
        asset_id: "a1",
        price_usd: 150,
        observed_at: oldDate,
        delayed_until: null,
      },
    ]);

    const request = new NextRequest("http://localhost/api/v1/dashboard/summary");
    const response = await summaryGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAnyStale).toBe(true);
    expect(body.isEstimated).toBe(false);
  });
});

describe("GET /api/v1/dashboard/distribution", () => {
  it("returns 422 when dim is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/dashboard/distribution?dim=currency");
    const response = await distributionGET(request);
    expect(response.status).toBe(422);
  });

  it("returns broker slices with percentages summing to 100", async () => {
    pushTrades([
      {
        asset_id: "a1",
        broker_id: "b1",
        trade_type: "BUY",
        quantity: 10,
        price_usd: 100,
        commission_usd: 0,
        total_invested_usd: 1000,
        deleted_at: null,
        assets: { ticker: "AAPL", name: "Apple", sector: null, country: null },
        brokers: { code: "ETORO", name: "eToro" },
      },
    ]);
    pushPrices([]);

    const request = new NextRequest("http://localhost/api/v1/dashboard/distribution?dim=broker");
    const response = await distributionGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dim).toBe("broker");
    expect(body.slices.length).toBeGreaterThan(0);
    const totalPct = body.slices.reduce((acc: number, s: { percent: number }) => acc + s.percent, 0);
    expect(Math.abs(totalPct - 100)).toBeLessThanOrEqual(0.01);
  });
});

describe("GET /api/v1/dashboard/evolution", () => {
  it("returns 422 when granularity is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/dashboard/evolution?granularity=hourly");
    const response = await evolutionGET(request);
    expect(response.status).toBe(422);
  });

  it("returns empty points when there are no trades", async () => {
    pushTrades([]);
    pushPrices([]);

    const request = new NextRequest("http://localhost/api/v1/dashboard/evolution");
    const response = await evolutionGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.points).toEqual([]);
    expect(body.granularity).toBe("monthly");
  });
});

describe("GET /api/v1/dashboard/returns", () => {
  it("returns 422 when groupBy is invalid", async () => {
    const request = new NextRequest("http://localhost/api/v1/dashboard/returns?groupBy=quarter");
    const response = await returnsGET(request);
    expect(response.status).toBe(422);
  });

  it("returns rows sorted by totalPnlUsd descending", async () => {
    pushTrades([
      {
        asset_id: "a1",
        broker_id: "b1",
        trade_type: "BUY",
        quantity: 10,
        price_usd: 100,
        commission_usd: 0,
        total_invested_usd: 1000,
        deleted_at: null,
        assets: { ticker: "AAPL", name: "Apple", sector: null, country: null },
        brokers: { code: "ETORO", name: "eToro" },
      },
    ]);
    pushPrices([]);

    const request = new NextRequest("http://localhost/api/v1/dashboard/returns?groupBy=stock");
    const response = await returnsGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.groupBy).toBe("stock");
    for (let i = 1; i < body.rows.length; i += 1) {
      expect(body.rows[i - 1].totalPnlUsd).toBeGreaterThanOrEqual(body.rows[i].totalPnlUsd);
    }
  });
});
