import { describe, expect, it } from "vitest";

import { calculatePortfolioPnl, calculateReturnPct } from "@/lib/calculations/pnl";
import type { Holding } from "@/lib/calculations/holdings";

const holding = (overrides: Partial<Holding>): Holding => ({
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

describe("calculateReturnPct", () => {
  it("returns zero when invested is zero", () => {
    expect(calculateReturnPct(0, 1200, 50)).toBe(0);
  });

  it("returns zero when invested is negative", () => {
    expect(calculateReturnPct(-100, 1200, 50)).toBe(0);
  });

  it("computes a positive return", () => {
    expect(calculateReturnPct(1000, 1200, 50)).toBeCloseTo(25);
  });

  it("computes a negative return", () => {
    expect(calculateReturnPct(1000, 800, 0)).toBeCloseTo(-20);
  });
});

describe("calculatePortfolioPnl", () => {
  it("returns zeros for no holdings", () => {
    const result = calculatePortfolioPnl([], 0);
    expect(result).toEqual({
      investedUsd: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      totalPnlUsd: 0,
      returnPct: 0,
    });
  });

  it("sums realized P/L across holdings", () => {
    const result = calculatePortfolioPnl(
      [
        holding({ realizedPnl: 50 }),
        holding({
          assetId: "a2",
          ticker: "NVDA",
          quantity: 5,
          averageCost: 200,
          totalInvested: 1000,
          realizedPnl: 30,
        }),
      ],
      0,
    );
    expect(result.investedUsd).toBe(2000);
    expect(result.realizedPnlUsd).toBe(80);
    expect(result.unrealizedPnlUsd).toBe(-2000);
    expect(result.totalPnlUsd).toBe(-1920);
  });

  it("treats negative quantity holdings as zero invested", () => {
    const result = calculatePortfolioPnl(
      [holding({ quantity: 0, totalInvested: 500 })],
      0,
    );
    expect(result.investedUsd).toBe(0);
  });
});
