import { describe, expect, it } from "vitest";

import { groupByDimension } from "@/lib/calculations/distribution";
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

describe("groupByDimension", () => {
  it("returns empty slices for no holdings", () => {
    const result = groupByDimension([], new Map(), "broker");
    expect(result.totalUsd).toBe(0);
    expect(result.slices).toEqual([]);
    expect(result.unclassified).toBe(false);
  });

  it("groups by broker with percentages summing to exactly 100", () => {
    const equity = new Map([
      ["a1::b1", 600],
      ["a2::b2", 400],
    ]);
    const result = groupByDimension(
      [
        holding({ brokerId: "b1", brokerName: "eToro" }),
        holding({
          assetId: "a2",
          ticker: "NVDA",
          brokerId: "b2",
          brokerName: "XTB",
        }),
      ],
      equity,
      "broker",
    );
    expect(result.slices).toHaveLength(2);
    const totalPct = result.slices.reduce((acc, s) => acc + s.percent, 0);
    expect(Math.abs(totalPct - 100)).toBeLessThanOrEqual(0.01);
  });

  it("routes missing sector to a single Sin clasificar slice", () => {
    const equity = new Map([
      ["a1::b1", 800],
      ["a2::b2", 200],
    ]);
    const result = groupByDimension(
      [
        holding({ sector: null }),
        holding({
          assetId: "a2",
          ticker: "NVDA",
          sector: null,
        }),
      ],
      equity,
      "sector",
    );
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].label).toBe("Sin clasificar");
    expect(result.slices[0].percent).toBe(100);
    expect(result.unclassified).toBe(true);
  });

  it("routes missing country to Sin clasificar", () => {
    const equity = new Map([["a1::b1", 1000]]);
    const result = groupByDimension(
      [holding({ country: null })],
      equity,
      "country",
    );
    expect(result.unclassified).toBe(true);
    expect(result.slices[0].label).toBe("Sin clasificar");
  });

  it("skips holdings with zero equity", () => {
    const equity = new Map<string, number>();
    const result = groupByDimension(
      [holding({ quantity: 0, totalInvested: 0 })],
      equity,
      "broker",
    );
    expect(result.totalUsd).toBe(0);
    expect(result.slices).toEqual([]);
  });

  it("aggregates staleness as the worst of all holdings in the slice", () => {
    const equity = new Map([
      ["a1::b1", 600],
      ["a2::b1", 400],
    ]);
    const staleness = new Map<string, "fresh" | "stale" | "estimated">([
      ["a1::b1", "fresh"],
      ["a2::b1", "stale"],
    ]);
    const result = groupByDimension(
      [
        holding({ brokerId: "b1", brokerName: "eToro" }),
        holding({
          assetId: "a2",
          ticker: "NVDA",
          brokerId: "b1",
          brokerName: "eToro",
        }),
      ],
      equity,
      "broker",
      staleness,
    );
    expect(result.slices[0].staleness).toBe("stale");
  });

  it("uses estimated when no staleness map is provided", () => {
    const equity = new Map([["a1::b1", 1000]]);
    const result = groupByDimension(
      [holding()],
      equity,
      "broker",
    );
    expect(result.slices[0].staleness).toBe("estimated");
  });

  it("treats a fresh and estimated mix as estimated (worst wins)", () => {
    const equity = new Map([
      ["a1::b1", 300],
      ["a2::b1", 700],
    ]);
    const staleness = new Map<string, "fresh" | "stale" | "estimated">([
      ["a1::b1", "fresh"],
      ["a2::b1", "estimated"],
    ]);
    const result = groupByDimension(
      [
        holding({ brokerId: "b1" }),
        holding({ assetId: "a2", ticker: "NVDA", brokerId: "b1" }),
      ],
      equity,
      "broker",
      staleness,
    );
    expect(result.slices[0].staleness).toBe("estimated");
  });
});
