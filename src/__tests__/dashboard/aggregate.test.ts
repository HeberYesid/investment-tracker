import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DashboardDataWithLedger } from "@/lib/dashboard/loader";

const loadDashboardDataMock = vi.fn();
const groupHistoricalPricesByAssetMock = vi.fn();
const loadSnapshotMock = vi.fn();


vi.mock("@/lib/dashboard/loader", () => ({
  loadDashboardData: (portfolioId: string, supabase: SupabaseClient) =>
    loadDashboardDataMock(portfolioId, supabase),
  groupHistoricalPricesByAsset: (rows: unknown) =>
    groupHistoricalPricesByAssetMock(rows),
}));

vi.mock("@/lib/dashboard/snapshot", () => ({
  loadSnapshot: (data: DashboardDataWithLedger, supabase: SupabaseClient) =>
    loadSnapshotMock(data, supabase),
}));

import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";

const PORTFOLIO_ID = "p1";
const assetId = "30000000-0000-4000-8000-000000000001";
const brokerId = "40000000-0000-4000-8000-000000000001";

function buildDashboardData(overrides: Partial<DashboardDataWithLedger> = {}): DashboardDataWithLedger {
  return {
    ledgerTrades: [{ id: "50000000-0000-4000-8000-000000000001", asset_id: assetId, broker_id: brokerId,
      trade_type: "BUY", trade_date: "2025-02-10", quantity: "10", price_usd: "100", commission_usd: "0", deleted_at: null }],
    ledgerPrices: [{ asset_id: assetId, price_usd: "150", observed_at: new Date().toISOString(), delayed_until: null }],
    trades: [
      {
        asset_id: assetId,
        broker_id: brokerId,
        trade_type: "BUY",
        trade_date: "2025-02-10",
        quantity: 10,
        price_usd: 100,
        commission_usd: 0,
        total_invested_usd: 1000,
        deleted_at: null,
      },
    ],
    assets: [
      { id: assetId, ticker: "AAPL", name: null, sector: "Technology", country: "US" },
    ],
    brokers: [{ id: brokerId, code: "ETORO", name: "eToro" }],
    latestMarketPrices: [
      {
        asset_id: assetId,
        price_usd: 150,
        observed_at: new Date().toISOString(),
        delayed_until: null,
      },
    ],
    historicalPrices: [
      { asset_id: assetId, price_usd: 120, observed_at: "2025-02-28T20:00:00.000Z" },
    ],
    portfolioId: PORTFOLIO_ID,
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<{
  isAnyEstimated: boolean;
  isAnyStale: boolean;
  benchmark: unknown;
}> = {}) {
  return {
    assets: [
      {
        id: assetId,
        ticker: "AAPL",
        isEstimated: false,
        isStale: false,
        observedAt: new Date().toISOString(),
        staleness: "fresh" as const,
      },
    ],
    isAnyEstimated: false,
    isAnyStale: false,
    benchmark: null,
    ...overrides,
  };
}

describe("loadDashboardAggregate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    loadDashboardDataMock.mockReset();
    groupHistoricalPricesByAssetMock.mockReset();
    loadSnapshotMock.mockReset();
    groupHistoricalPricesByAssetMock.mockImplementation(
      (rows: Array<{ asset_id: string; price_usd: number; observed_at: string }>) => {
        const map = new Map<string, Array<{ observedAt: string; priceUsd: number }>>();
        for (const row of rows ?? []) {
          const list = map.get(row.asset_id) ?? [];
          list.push({ observedAt: row.observed_at, priceUsd: row.price_usd });
          map.set(row.asset_id, list);
        }
        return map;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only snapshot for the advanced scope", async () => {
    const data = buildDashboardData();
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());

    const supabase = {} as SupabaseClient;
    const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "advanced");

    expect(result.snapshot.assets).toHaveLength(1);
    expect(result.summary).toBeUndefined();
    expect(result.evolution).toBeUndefined();
    expect(result.returns).toBeUndefined();
    expect(result.distribution).toBeUndefined();
  });

  it("returns summary, evolution, returns and distribution for the full scope", async () => {
    const data = buildDashboardData();
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());

    const supabase = {} as SupabaseClient;
    const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full");

    expect(result.summary).toBeDefined();
    expect(result.summary!.equityUsd).toBe("1500");
    expect(result.summary!.investedUsd).toBe("1000");
    expect(result.summary!.holdingsCount).toBe(1);
    expect(result.evolution).toBeDefined();
    expect(result.evolution!.points.length).toBeGreaterThan(0);
    expect(result.returns).toBeDefined();
    expect(result.distribution).toBeDefined();
    expect(result.distribution!.dim).toBe("broker");
  });

  it("propagates isEstimated from the evolution series to the response", async () => {
    const data = buildDashboardData({
      historicalPrices: [],
      latestMarketPrices: [],
      ledgerPrices: [],
    });
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());
    groupHistoricalPricesByAssetMock.mockReturnValue(new Map());

    const supabase = {} as SupabaseClient;
    const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full");

    expect(result.evolution!.isEstimated).toBe(true);
    expect(result.summary!.isEstimated).toBe(true);
  });

  it("flags summary.isAnyStale when any active holding has a stale quote", async () => {
    const data = buildDashboardData({ ledgerPrices: [{ ...buildDashboardData().ledgerPrices[0], observed_at: "2026-06-14T23:32:00Z", source: "STOOQ" }] });
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());

    const supabase = {} as SupabaseClient;
    const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full");

    expect(result.summary!.isAnyStale).toBe(true);
    expect(result.summary!.staleTickers).toEqual(["AAPL"]);
    expect(result.distribution?.slices).toMatchObject([{ valueUsd: "1500", staleness: "stale", source: "STOOQ", observedAt: "2026-06-14T23:32:00Z" }]);
  });
});
