import { describe, expect, it } from "vitest";

import { aggregateReturns } from "@/lib/calculations/returns-aggregation";
import type { Holding } from "@/lib/calculations/holdings";
import type { EvolutionInputTrade } from "@/lib/calculations/evolution";

const trade = (overrides: Partial<EvolutionInputTrade> = {}): EvolutionInputTrade => ({
  asset_id: "a1",
  broker_id: "b1",
  trade_date: "2025-01-15",
  trade_type: "BUY",
  quantity: 0,
  price_usd: 0,
  commission_usd: 0,
  deleted_at: null,
  ...overrides,
});

const holding = (overrides: Partial<Holding> = {}): Holding => ({
  assetId: "a1",
  brokerId: "b1",
  ticker: "AAPL",
  assetName: "Apple",
  sector: "Technology",
  country: "US",
  brokerCode: "ETORO",
  brokerName: "eToro",
  quantity: 10,
  averageCost: 100,
  totalInvested: 1000,
  realizedPnl: 0,
  ...overrides,
});

describe("aggregateReturns", () => {
  it("returns no rows for empty trades and holdings", () => {
    const result = aggregateReturns({
      groupBy: "month",
      trades: [],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result).toEqual([]);
  });

  it("aggregates by month with one row per YYYY-MM", () => {
    const result = aggregateReturns({
      groupBy: "month",
      trades: [
        trade({ trade_date: "2025-01-10", trade_type: "BUY", quantity: 10, price_usd: 100 }),
        trade({ trade_date: "2025-02-10", trade_type: "BUY", quantity: 5, price_usd: 120 }),
      ],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result).toHaveLength(2);
    const keys = result.map((r) => r.key).sort();
    expect(keys).toEqual(["2025-01", "2025-02"]);
  });

  it("aggregates by stock using the holding ticker as label", () => {
    const result = aggregateReturns({
      groupBy: "stock",
      trades: [
        trade({ trade_type: "BUY", quantity: 10, price_usd: 100 }),
        trade({
          asset_id: "a2",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 4,
          price_usd: 250,
        }),
      ],
      holdings: [
        holding({ assetId: "a1", ticker: "AAPL" }),
        holding({ assetId: "a2", ticker: "NVDA", quantity: 4, totalInvested: 1000 }),
      ],
      equityByHolding: new Map([
        ["a1::b1", 1100],
        ["a2::b1", 1100],
      ]),
    });
    expect(result).toHaveLength(2);
    const aapl = result.find((r) => r.key === "AAPL");
    const nvda = result.find((r) => r.key === "NVDA");
    expect(aapl).toBeDefined();
    expect(nvda).toBeDefined();
  });

  it("aggregates by broker using the broker name as label", () => {
    const result = aggregateReturns({
      groupBy: "broker",
      trades: [
        trade({ broker_id: "b1", trade_type: "BUY", quantity: 10, price_usd: 100 }),
        trade({
          broker_id: "b2",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 5,
          price_usd: 200,
        }),
      ],
      holdings: [
        holding({ brokerId: "b1", brokerName: "eToro" }),
        holding({
          assetId: "a1",
          brokerId: "b2",
          brokerName: "XTB",
          ticker: "AAPL",
          quantity: 5,
          totalInvested: 1000,
        }),
      ],
      equityByHolding: new Map(),
    });
    expect(result).toHaveLength(2);
    const labels = result.map((r) => r.label).sort();
    expect(labels).toEqual(["XTB", "eToro"]);
  });

  it("sorts rows by totalPnlUsd descending", () => {
    const result = aggregateReturns({
      groupBy: "month",
      trades: [
        trade({ trade_date: "2025-01-10", trade_type: "BUY", quantity: 10, price_usd: 100 }),
        trade({ trade_date: "2025-02-10", trade_type: "BUY", quantity: 5, price_usd: 200 }),
      ],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result[0].totalPnlUsd).toBeGreaterThanOrEqual(result[1].totalPnlUsd);
  });

  it("returns returnPct 0 for rows with zero invested", () => {
    const result = aggregateReturns({
      groupBy: "year",
      trades: [trade({ trade_type: "DIVIDEND", quantity: 10, price_usd: 1 })],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result[0].returnPct).toBe(0);
  });
});
