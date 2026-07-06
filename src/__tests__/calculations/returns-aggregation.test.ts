import { describe, expect, it } from "vitest";

import {
  aggregateReturns,
  computeAnnualReturnsFromSeries,
} from "@/lib/calculations/returns-aggregation";
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
      groupBy: "year",
      trades: [],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result).toEqual([]);
  });

  it("includes actualUsd as investedUsd + totalPnlUsd", () => {
    const result = aggregateReturns({
      groupBy: "stock",
      trades: [
        trade({ trade_type: "BUY", quantity: 10, price_usd: 100 }),
      ],
      holdings: [
        holding({ totalInvested: 1000, quantity: 10 }),
      ],
      equityByHolding: new Map([
        ["a1::b1", 1300],
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0].investedUsd).toBe(1000);
    expect(result[0].actualUsd).toBeGreaterThanOrEqual(result[0].investedUsd);
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
      groupBy: "year",
      trades: [
        trade({ trade_date: "2024-01-10", trade_type: "BUY", quantity: 10, price_usd: 100 }),
        trade({ trade_date: "2025-02-10", trade_type: "BUY", quantity: 5, price_usd: 200 }),
      ],
      holdings: [],
      equityByHolding: new Map(),
    });
    expect(result).toHaveLength(2);
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

describe("computeAnnualReturnsFromSeries", () => {
  it("returns empty array for empty points", () => {
    const result = computeAnnualReturnsFromSeries([]);
    expect(result).toEqual([]);
  });

  it("computes annual returns from evolution points", () => {
    const result = computeAnnualReturnsFromSeries([
      { date: "2024-01-31", valueUsd: 1000 },
      { date: "2024-06-30", valueUsd: 1200 },
      { date: "2024-12-31", valueUsd: 1500 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("2024");
    expect(result[0].investedUsd).toBe(1000);
    expect(result[0].actualUsd).toBe(1500);
    expect(result[0].returnPct).toBe(50);
  });

  it("chains years: end of year N-1 becomes start of year N", () => {
    const result = computeAnnualReturnsFromSeries([
      { date: "2023-12-31", valueUsd: 800 },
      { date: "2024-06-30", valueUsd: 1200 },
      { date: "2024-12-31", valueUsd: 1500 },
      { date: "2025-03-31", valueUsd: 1800 },
    ]);
    expect(result).toHaveLength(3);
    const y2024 = result.find((r) => r.key === "2024")!;
    const y2023 = result.find((r) => r.key === "2023")!;
    expect(y2023.investedUsd).toBe(800);
    expect(y2023.actualUsd).toBe(800);
    expect(y2024.investedUsd).toBe(800);
    expect(y2024.actualUsd).toBe(1500);
  });

  it("returns newest year first", () => {
    const result = computeAnnualReturnsFromSeries([
      { date: "2023-12-31", valueUsd: 1000 },
      { date: "2024-12-31", valueUsd: 1500 },
      { date: "2025-06-30", valueUsd: 1800 },
    ]);
    expect(result[0].key).toBe("2025");
  });
});
