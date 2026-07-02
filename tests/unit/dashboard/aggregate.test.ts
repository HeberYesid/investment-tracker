import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DashboardData } from "@/lib/dashboard/loader";

const loadDashboardDataMock = vi.fn();
const groupHistoricalPricesByAssetMock = vi.fn();
const loadSnapshotMock = vi.fn();
const stalenessState = { values: [] as string[] };

vi.mock("@/lib/dashboard/loader", () => ({
  loadDashboardData: (portfolioId: string, supabase: SupabaseClient) =>
    loadDashboardDataMock(portfolioId, supabase),
  groupHistoricalPricesByAsset: (rows: unknown) =>
    groupHistoricalPricesByAssetMock(rows),
}));

vi.mock("@/lib/dashboard/snapshot", () => ({
  loadSnapshot: (data: DashboardData, supabase: SupabaseClient) =>
    loadSnapshotMock(data, supabase),
  computeAssetStaleness: (assetIds: string[]) => {
    const map = new Map<string, string>();
    for (const id of assetIds) {
      const value = stalenessState.values.shift() ?? "fresh";
      map.set(id, value);
    }
    return map;
  },
}));

import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";

const PORTFOLIO_ID = "p1";

function buildDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    trades: [
      {
        asset_id: "a1",
        broker_id: "b1",
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
      { id: "a1", ticker: "AAPL", name: null, sector: "Technology", country: "US" },
    ],
    brokers: [{ id: "b1", code: "ETORO", name: "eToro" }],
    latestMarketPrices: [
      {
        asset_id: "a1",
        price_usd: 150,
        observed_at: new Date().toISOString(),
        delayed_until: null,
      },
    ],
    historicalPrices: [
      { asset_id: "a1", price_usd: 120, observed_at: "2025-02-28T20:00:00.000Z" },
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
        id: "a1",
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
    expect(result.summary!.equityUsd).toBe(1500);
    expect(result.summary!.investedUsd).toBe(1000);
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
    stalenessState.values = ["stale"];
    const data = buildDashboardData();
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());

    const supabase = {} as SupabaseClient;
    const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full");

    expect(result.summary!.isAnyStale).toBe(true);
  });
});
