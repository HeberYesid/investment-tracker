import { describe, expect, it } from "vitest";

import { calculateTotalEquity } from "@/lib/calculations/equity";
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

describe("calculateTotalEquity", () => {
  it("returns zero equity for no holdings", () => {
    expect(calculateTotalEquity([], [])).toEqual({
      equityUsd: 0,
      isAnyEstimated: false,
    });
  });

  it("uses the trade average cost when no market price is available", () => {
    const result = calculateTotalEquity(
      [holding({ assetId: "a1", quantity: 10, averageCost: 100 })],
      [],
    );
    expect(result.equityUsd).toBe(1000);
    expect(result.isAnyEstimated).toBe(true);
  });

  it("uses market price when one is available", () => {
    const result = calculateTotalEquity(
      [holding({ assetId: "a1", quantity: 10, averageCost: 100 })],
      [
        {
          asset_id: "a1",
          price_usd: 120,
          observed_at: "2025-06-01T00:00:00Z",
          delayed_until: null,
        },
      ],
    );
    expect(result.equityUsd).toBe(1200);
    expect(result.isAnyEstimated).toBe(false);
  });

  it("flags isAnyEstimated when only one of two holdings is estimated", () => {
    const result = calculateTotalEquity(
      [
        holding({ assetId: "a1", quantity: 10, averageCost: 100 }),
        holding({ assetId: "a2", ticker: "NVDA", quantity: 5, averageCost: 200 }),
      ],
      [
        {
          asset_id: "a1",
          price_usd: 120,
          observed_at: "2025-06-01T00:00:00Z",
          delayed_until: null,
        },
      ],
    );
    expect(result.equityUsd).toBe(1200 + 1000);
    expect(result.isAnyEstimated).toBe(true);
  });

  it("ignores holdings with zero or negative quantity", () => {
    const result = calculateTotalEquity(
      [
        holding({ assetId: "a1", quantity: 0, averageCost: 100 }),
        holding({ assetId: "a2", ticker: "NVDA", quantity: 10, averageCost: 50 }),
      ],
      [],
    );
    expect(result.equityUsd).toBe(500);
  });
});
