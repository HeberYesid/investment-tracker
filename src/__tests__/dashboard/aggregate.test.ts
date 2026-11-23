import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DashboardDataWithLedger } from "@/lib/dashboard/loader";
import type { LedgerAsset } from "@/lib/calculations/position-ledger";

const loadDashboardDataMock = vi.fn();
const groupHistoricalPricesByAssetMock = vi.fn();
const loadSnapshotMock = vi.fn();
const loadMonthlyClosingPricesMock = vi.fn();
const countTradesThroughCutoffMock = vi.fn();
const serviceClient = vi.hoisted(() => ({} as SupabaseClient));

vi.mock("@/lib/supabase/server", () => ({ createServiceSupabaseClient: () => serviceClient }));

vi.mock("@/lib/dashboard/loader", () => ({
  loadDashboardData: (...args: unknown[]) => loadDashboardDataMock(...args),
  groupHistoricalPricesByAsset: (rows: unknown) =>
    groupHistoricalPricesByAssetMock(rows),
  loadMonthlyClosingPrices: (...args: unknown[]) => loadMonthlyClosingPricesMock(...args),
  countTradesThroughCutoff: (...args: unknown[]) => countTradesThroughCutoffMock(...args),
}));

vi.mock("@/lib/dashboard/snapshot", () => ({
  loadSnapshot: (data: DashboardDataWithLedger, supabase: SupabaseClient) =>
    loadSnapshotMock(data, supabase),
}));

import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { DEMO_PORTFOLIO_ID, loadDemoDashboardAggregate } from "@/lib/dashboard/demo-loader";

const PORTFOLIO_ID = "p1";
const assetId = "30000000-0000-4000-8000-000000000001";
const brokerId = "40000000-0000-4000-8000-000000000001";
const monthly = { includeMonthlySummary: true } as const;
const catalog: LedgerAsset = { id: assetId, ticker: "AAPL", name: null, sector: "Technology", country: "US", currency: "USD" };

function buildDashboardData(overrides: Partial<DashboardDataWithLedger> = {}): DashboardDataWithLedger {
  return {
    ledgerTradesComplete: true,
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
    assets: [catalog],
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
    loadMonthlyClosingPricesMock.mockReset();
    countTradesThroughCutoffMock.mockReset();
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

  it("activa el cálculo mensual solo en la carga privada y conserva el agregado base", async () => {
    const data = buildDashboardData();
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());
    loadMonthlyClosingPricesMock.mockResolvedValueOnce(new Map([[assetId, "100"]])).mockResolvedValueOnce(new Map([[assetId, "110"]]));
    const supabase = {} as SupabaseClient;
    const base = await loadDashboardAggregate(PORTFOLIO_ID, supabase);
    expect(base).not.toHaveProperty("monthlySummary");
    expect(await loadDashboardAggregate(PORTFOLIO_ID, supabase, "advanced")).toEqual({ snapshot: base.snapshot });
    expect(await loadDemoDashboardAggregate()).toEqual(base);
    expect(loadDashboardDataMock).toHaveBeenLastCalledWith(DEMO_PORTFOLIO_ID, serviceClient);
    expect(loadMonthlyClosingPricesMock).not.toHaveBeenCalled();

    loadDashboardDataMock.mockClear();
    const { monthlySummary, ...withMonthly } = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly);
    expect(withMonthly).toEqual(base);
    expect(loadDashboardDataMock).toHaveBeenCalledTimes(1);
    expect(loadMonthlyClosingPricesMock.mock.calls).toEqual([
      [supabase, { assetIds: [assetId], fromInclusive: "2026-04-23T00:00:00.000Z", toExclusive: "2026-05-01T00:00:00.000Z" }],
      [supabase, { assetIds: [assetId], fromInclusive: "2026-05-24T00:00:00.000Z", toExclusive: "2026-06-01T00:00:00.000Z" }],
    ]);
    expect(monthlySummary).toMatchObject({ kind: "summary", summary: { openingValueUsd: "1000", closingValueUsd: "1100", changeUsd: "100" } });

    loadMonthlyClosingPricesMock.mockClear();
    const { ledgerTrades: [buy], trades: [dashboardBuy] } = data;
    const future = "2026-06-01";
    loadDashboardDataMock.mockResolvedValueOnce(buildDashboardData({
      ledgerTrades: [{ ...buy, trade_date: future }], trades: [{ ...dashboardBuy, trade_date: future }],
    }));
    expect((await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly)).monthlySummary).toEqual({ kind: "absent" });

    const sale = { trade_date: "2026-04-21", trade_type: "SELL" as const };
    loadDashboardDataMock.mockResolvedValueOnce(buildDashboardData({
      ledgerTrades: [buy, { ...buy, ...sale, id: "50000000-0000-4000-8000-000000000002" }],
      trades: [dashboardBuy, { ...dashboardBuy, ...sale }],
    }));
    expect((await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly)).monthlySummary).toMatchObject({
      kind: "summary", summary: { openingValueUsd: "0", closingValueUsd: "0", changeUsd: "0" },
    });
    expect(loadMonthlyClosingPricesMock).not.toHaveBeenCalled();
  });

  it("aísla un error de cotizaciones", async () => {
    const data = buildDashboardData();
    const supabase = {} as SupabaseClient;
    loadDashboardDataMock.mockResolvedValue(data);
    loadSnapshotMock.mockResolvedValue(buildSnapshot());
    loadMonthlyClosingPricesMock.mockRejectedValueOnce(new Error("detalle interno"))
      .mockResolvedValueOnce(new Map([[assetId, "110"]]));
    const { monthlySummary, ...base } = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly);
    expect(base).toEqual(await loadDashboardAggregate(PORTFOLIO_ID, supabase));
    expect(monthlySummary).toMatchObject({ kind: "summary", summary: {
      openingValueUsd: null, openingReason: "PRICE_READ_FAILED", closingValueUsd: "1100", changeUsd: null, activity: { BUY: 0, SELL: 0 },
    } });
    expect(JSON.stringify(monthlySummary)).not.toContain("detalle interno");
    loadMonthlyClosingPricesMock.mockClear();
    loadDashboardDataMock.mockRejectedValueOnce(new Error("falló el tablero"));
    await expect(loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly)).rejects.toThrow("falló el tablero");
    expect(loadMonthlyClosingPricesMock).not.toHaveBeenCalled();
  });

  it("verifica la completitud sin inferirla del tamaño de página", async () => {
    const supabase = {} as SupabaseClient;
    const { ledgerTrades: [buy], trades: [dashboardBuy] } = buildDashboardData();
    const makePage = (trade_date: string, complete?: boolean) => ({
      ...buildDashboardData({
        trades: Array.from({ length: 1_000 }, () => ({ ...dashboardBuy, trade_date })),
        ledgerTrades: Array.from({ length: 1_000 }, (_, index) => ({
          ...buy, trade_date, id: `50000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
      }),
      ledgerTradesComplete: complete,
    });
    loadSnapshotMock.mockResolvedValue(buildSnapshot());
    loadMonthlyClosingPricesMock.mockResolvedValue(new Map([[assetId, "110"]]));
    loadDashboardDataMock.mockResolvedValue(makePage("2026-04-20", true));
    const base = await loadDashboardAggregate(PORTFOLIO_ID, supabase);
    expect((await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly)).monthlySummary).toMatchObject({
      kind: "summary", summary: { openingValueUsd: "1100000", closingValueUsd: "1100000", activity: { BUY: 0 } },
    });
    expect(loadDashboardDataMock).toHaveBeenLastCalledWith(PORTFOLIO_ID, supabase, true);
    expect(countTradesThroughCutoffMock).not.toHaveBeenCalled();

    const incomplete = { kind: "summary", summary: {
      openingValueUsd: null, closingValueUsd: null, changeUsd: null, activity: null,
      openingReason: "INCOMPLETE_TRADES", closingReason: "INCOMPLETE_TRADES", activityReason: "INCOMPLETE_TRADES",
    } };
    loadMonthlyClosingPricesMock.mockClear();
    for (const complete of [false, undefined]) {
      loadDashboardDataMock.mockResolvedValueOnce(makePage("2026-04-20", complete));
      const { monthlySummary, ...rest } = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly);
      expect(monthlySummary).toMatchObject(incomplete);
      expect(rest).toEqual(base);
    }
    expect(countTradesThroughCutoffMock).not.toHaveBeenCalled();
    loadDashboardDataMock.mockResolvedValue(makePage("2026-06-01", false));
    countTradesThroughCutoffMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("detalle privado"));
    for (const expected of [{ kind: "absent" }, incomplete, { kind: "history-unverified" }, { kind: "history-unverified" }]) {
      const result = await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly);
      expect(result.monthlySummary).toMatchObject(expected);
    }
    expect(countTradesThroughCutoffMock).toHaveBeenCalledTimes(4);
    expect(countTradesThroughCutoffMock).toHaveBeenLastCalledWith(PORTFOLIO_ID, supabase, "2026-05-31");

    const invalidOnly = { ...buildDashboardData({ ledgerTrades: [
      { ...buy, trade_date: "2026-06-01" }, { ...buy, trade_date: "2026-06-31" },
    ] }), ledgerTradesComplete: true };
    loadDashboardDataMock.mockResolvedValueOnce(invalidOnly);
    expect((await loadDashboardAggregate(PORTFOLIO_ID, supabase, "full", monthly)).monthlySummary).toEqual({ kind: "history-unverified" });
    expect(countTradesThroughCutoffMock).toHaveBeenCalledTimes(4);
    expect(loadMonthlyClosingPricesMock).not.toHaveBeenCalled();
  });
});
