import { describe, expect, it } from "vitest";

import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";

describe("buildPortfolioValueSeries", () => {
  it("returns empty points for no trades", () => {
    const result = buildPortfolioValueSeries([], { today: new Date("2025-06-15") });
    expect(result.points).toEqual([]);
    expect(result.granularity).toBe("monthly");
  });

  it("uses monthly bucket boundaries by default", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-01-05",
          trade_type: "BUY",
          quantity: 10,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-02-15",
          trade_type: "BUY",
          quantity: 5,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      { granularity: "monthly", today: new Date("2025-03-15") },
    );
    expect(result.points.map((p) => p.date)).toEqual(["2025-01-31", "2025-02-28"]);
    expect(result.points[1].valueUsd).toBe(1500);
  });

  it("emits daily points when granularity is daily", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-01-05",
          trade_type: "BUY",
          quantity: 10,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      { granularity: "daily", today: new Date("2025-01-10") },
    );
    expect(result.points).toHaveLength(1);
    expect(result.points[0].date).toBe("2025-01-05");
  });

  it("returns points sorted in ascending date order", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-03-01",
          trade_type: "BUY",
          quantity: 5,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-01-01",
          trade_type: "BUY",
          quantity: 10,
          price_usd: 50,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      { granularity: "monthly", today: new Date("2025-04-01") },
    );
    const dates = result.points.map((p) => p.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("ignores soft-deleted trades", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-01-01",
          trade_type: "BUY",
          quantity: 10,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 100,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: "2025-02-02T00:00:00Z",
        },
      ],
      { granularity: "monthly", today: new Date("2025-03-01") },
    );
    expect(result.points[1].valueUsd).toBe(1000);
  });
});
