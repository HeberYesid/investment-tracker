import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";

type MockBuilder = Record<string, Mock>;

const queuedResults: Record<string, unknown>[] = [];
const builders: MockBuilder[] = [];

function createBuilder(): MockBuilder {
  const builder: MockBuilder = {};
  const chainMethods = [
    "select", "insert", "update", "eq", "is",
    "order", "range", "single", "maybeSingle", "limit", "gte", "lte", "in", "or",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.then = vi.fn((resolve: (v: unknown) => void) => {
    const result = queuedResults.shift();
    resolve(result ?? { data: null, error: null });
  });
  builders.push(builder);
  return builder;
}

const mockSupabase = {
  from: vi.fn().mockImplementation(() => createBuilder()),
  rpc: vi.fn().mockImplementation(() => {
    const result = queuedResults.shift();
    return { select: () => Promise.resolve(result ?? { data: null, error: null }) };
  }),
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
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/supabase/auth", () => ({
  resolvePortfolioContext: async () => ({ kind: "active", portfolio: {
      portfolioId: "p1",
      role: "OWNER",
      portfolio: {
        id: "p1",
        name: "Mi portafolio",
        base_currency: "USD",
      },
    } }),
}));

import { GET as summaryGET } from "@/app/api/v1/dashboard/summary/route";
import { GET as snapshotGET } from "@/app/api/v1/dashboard/snapshot/route";
import { GET as distributionGET } from "@/app/api/v1/dashboard/distribution/route";
import { GET as evolutionGET } from "@/app/api/v1/dashboard/evolution/route";
import { GET as returnsGET } from "@/app/api/v1/dashboard/returns/route";
import { DistributionResponse, ReturnsResponse, SummaryResponse } from "@/lib/validations/dashboard";

beforeEach(() => {
  vi.clearAllMocks();
  queuedResults.length = 0;
  builders.length = 0;
});

const assetId = "30000000-0000-4000-8000-000000000001";
const brokerId = "40000000-0000-4000-8000-000000000001";

function pushTrades(rows: { [key: string]: unknown; quantity: number; price_usd: number; commission_usd: number; trade_date?: string }[] = []) {
  queuedResults.push({ data: rows.map((row, index) => ({
    ...row, id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    trade_date: row.trade_date ?? "2025-01-10", quantity: String(row.quantity),
    price_usd: String(row.price_usd), commission_usd: String(row.commission_usd),
  })), error: null });
}

function pushPrices(rows: unknown[] = []) {
  queuedResults.push({ data: rows, error: null });
}

function pushHistoricalPrices(rows: unknown[] = []) {
  queuedResults.push({ data: rows, error: null });
}

function pushNoBenchmarkAsset() {
  queuedResults.push({ data: null, error: null });
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
        asset_id: assetId,
        broker_id: brokerId,
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
    pushHistoricalPrices([]);
    pushNoBenchmarkAsset();

    const request = new NextRequest("http://localhost/api/v1/dashboard/summary");
    const response = await summaryGET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      equityUsd: "1000",
      investedUsd: "1000",
      realizedPnlUsd: "0",
      unrealizedPnlUsd: "0",
      totalPnlUsd: "0",
      returnPct: 0,
      holdingsCount: 1,
      isEstimated: true,
      isAnyStale: false,
      staleTickers: [],
      shouldShowStaleBanner: true,
      sync: { lastAttemptAt: null, lastFailureReason: "NONE", failedAssetCount: 0 },
    });
  });

  it("returns isAnyStale true when a quote is older than 2h", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("La lectura no debe consultar proveedores"));
    const now = Date.now();
    const oldDate = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    pushTrades([
      {
        asset_id: assetId,
        broker_id: brokerId,
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
        asset_id: assetId,
        price_usd: "150",
        observed_at: oldDate,
        delayed_until: null,
      },
    ]);
    pushHistoricalPrices([]);
    pushNoBenchmarkAsset();

    const request = new NextRequest("http://localhost/api/v1/dashboard/summary");
    const response = await summaryGET(request).finally(() => {
      const externalCalls = network.mock.calls.length;
      network.mockRestore();
      expect(externalCalls).toBe(0);
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.isAnyStale).toBe(true);
    expect(body.staleTickers).toEqual(["AAPL"]);
    expect(body.isEstimated).toBe(false);
  });
});

it("el snapshot devuelve el diagnóstico agregado sin incorporar errores crudos", async () => {
  pushTrades();
  pushNoBenchmarkAsset();
  const response = await snapshotGET(new NextRequest("http://localhost/api/v1/dashboard/snapshot"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    shouldShowStaleBanner: false,
    sync: { lastAttemptAt: null, lastFailureReason: "NONE", failedAssetCount: 0 },
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
        asset_id: assetId,
        broker_id: brokerId,
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

  it("conserva la fuente y fecha de la cotización desactualizada más antigua del corte", async () => {
    const other = "30000000-0000-4000-8000-000000000002";
    const buy = { broker_id: brokerId, trade_type: "BUY", quantity: 1, price_usd: 10, commission_usd: 0,
      total_invested_usd: 10, deleted_at: null, brokers: { name: "XTB", code: "XTB" } };
    pushTrades([{ ...buy, asset_id: assetId }, { ...buy, asset_id: other }]);
    pushPrices([
      { asset_id: assetId, price_usd: "19.25", observed_at: "2025-01-16T18:00:00Z", source: "YAHOO", delayed_until: null },
      { asset_id: other, price_usd: "17.5", observed_at: "2025-01-15T18:00:00Z", source: "STOOQ", delayed_until: null },
    ]);
    const response = await distributionGET(new NextRequest("http://localhost/api/v1/dashboard/distribution?dim=broker"));
    expect(response.status).toBe(200);
    expect(DistributionResponse.parse(await response.json())).toMatchObject({ totalUsd: "36.75", ledgerStatus: "complete",
      slices: [{ valueUsd: "36.75", staleness: "stale", source: "STOOQ", observedAt: "2025-01-15T18:00:00Z", percent: 100 }] });
  });
});

it("las rutas actuales declaran indisponible el legado y las históricas conservan la respuesta numérica", async () => {
  const common = { asset_id: assetId, broker_id: brokerId, deleted_at: null, commission_usd: 0,
    assets: { ticker: "AAPL", name: "Apple" }, brokers: { code: "ETORO", name: "eToro" } };
  const buy = { ...common, trade_type: "BUY", quantity: 1, price_usd: 100, total_invested_usd: 100, trade_date: "2025-01-10" };
  const legacy = { ...common, trade_type: "FEE", quantity: 1, price_usd: 0, commission_usd: 2, total_invested_usd: 2, trade_date: "2025-01-11" };
  const queue = () => { pushTrades([buy, legacy]); pushPrices(); pushHistoricalPrices(); };
  const fields = { ledgerStatus: "unavailable", ledgerIssues: [{ code: "INVALID_TRADE", tradeDate: "2025-01-11" }] };
  const request = (path: string) => new NextRequest(`http://localhost/api/v1/dashboard/${path}`);
  queue();
  pushNoBenchmarkAsset();
  const summary = await summaryGET(request("summary"));
  expect(summary.status).toBe(200);
  expect(SummaryResponse.parse(await summary.json())).toMatchObject({ ...fields, equityUsd: null, twr: null });
  queue();
  const distribution = await distributionGET(request("distribution"));
  expect(distribution.status).toBe(200);
  expect(DistributionResponse.parse(await distribution.json())).toMatchObject({ ...fields, totalUsd: null, slices: [] });
  queue();
  const current = await returnsGET(request("returns?groupBy=stock"));
  expect(current.status).toBe(200);
  expect(ReturnsResponse.parse(await current.json())).toMatchObject({ ...fields, rows: [{ key: assetId, actualUsd: null }] });
  queue();
  const annual = await returnsGET(request("returns?groupBy=year"));
  expect(annual.status).toBe(200);
  const annualBody = await annual.json();
  expect(ReturnsResponse.parse(annualBody)).toEqual(annualBody);
  expect(annualBody).toMatchObject({ groupBy: "year", rows: [{ key: "2025", actualUsd: expect.any(Number), realizedPnlUsd: 0 }] });
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
        asset_id: assetId,
        broker_id: brokerId,
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
