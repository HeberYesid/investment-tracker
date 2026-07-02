import { describe, expect, it } from "vitest";

import { buildPortfolioValueSeries } from "@/lib/calculations/evolution";

describe("buildPortfolioValueSeries", () => {
  it("returns empty points for no trades", () => {
    const result = buildPortfolioValueSeries([], { today: new Date("2025-06-15") });
    expect(result.points).toEqual([]);
    expect(result.granularity).toBe("monthly");
    expect(result.isEstimated).toBe(true);
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

  it("uses historical price for held asset when available", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-02-15",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 200,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-03-10",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 300,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-04-01"),
        historicalPricesByAsset: new Map([
          [
            "a1",
            [
              { observedAt: "2025-02-28T20:00:00.000Z", priceUsd: 110 },
              { observedAt: "2025-03-31T20:00:00.000Z", priceUsd: 115 },
            ],
          ],
        ]),
      },
    );
    const feb = result.points.find((p) => p.date === "2025-02-28");
    const mar = result.points.find((p) => p.date === "2025-03-31");
    expect(feb?.valueUsd).toBe(220);
    expect(mar?.valueUsd).toBe(345);
    expect(result.isEstimated).toBe(false);
  });

  it("falls back to trade price when no history", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 2,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-03-01"),
      },
    );
    const feb = result.points.find((p) => p.date === "2025-02-28");
    expect(feb?.valueUsd).toBe(200);
    expect(result.isEstimated).toBe(true);
  });

  it("does not corrupt the fallback price with a DIVIDEND", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
        {
          asset_id: "a1",
          trade_date: "2025-02-20",
          trade_type: "DIVIDEND",
          quantity: 0,
          price_usd: 0,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-03-15"),
      },
    );
    const feb = result.points.find((p) => p.date === "2025-02-28");
    expect(feb?.valueUsd).toBe(100);
  });

  it("marks the series as not estimated when fully historical", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-03-01"),
        historicalPricesByAsset: new Map([
          [
            "a1",
            [
              { observedAt: "2025-02-28T20:00:00.000Z", priceUsd: 110 },
            ],
          ],
        ]),
      },
    );
    expect(result.isEstimated).toBe(false);
  });

  it("marks the series as estimated when fallback is used", () => {
    const result = buildPortfolioValueSeries(
      [
        {
          asset_id: "a1",
          trade_date: "2025-02-01",
          trade_type: "BUY",
          quantity: 1,
          price_usd: 100,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-03-01"),
      },
    );
    expect(result.isEstimated).toBe(true);
  });

  it("carries forward the last value into a gap bucket", () => {
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
          trade_date: "2025-03-10",
          trade_type: "BUY",
          quantity: 5,
          price_usd: 200,
          commission_usd: 0,
          deleted_at: null,
        },
      ],
      {
        granularity: "monthly",
        today: new Date("2025-04-01"),
      },
    );
    const jan = result.points.find((p) => p.date === "2025-01-31");
    const feb = result.points.find((p) => p.date === "2025-02-28");
    const mar = result.points.find((p) => p.date === "2025-03-31");
    expect(jan?.valueUsd).toBe(1000);
    expect(feb?.valueUsd).toBe(1000);
    expect(mar?.valueUsd).toBe(3000);
  });
});
