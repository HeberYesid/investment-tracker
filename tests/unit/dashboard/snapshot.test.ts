import { describe, expect, it } from "vitest";

import {
  buildBenchmarkSeries,
  buildSnapshotAssets,
  computeAssetStaleness,
  dedupBenchmarkRowsPerUtcDay,
  type SnapshotAsset,
} from "@/lib/dashboard/snapshot";
import type { DashboardData } from "@/lib/dashboard/loader";

const NOW = new Date("2025-06-15T12:00:00Z");
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
const THREE_HOURS_AGO = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
const THREE_DAYS_AGO = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
const FIVE_DAYS_AGO = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
const EIGHT_DAYS_AGO = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
const TEN_DAYS_AGO = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

function dashboardData(
  overrides: Partial<DashboardData> = {},
): DashboardData {
  return {
    trades: [],
    assets: [],
    brokers: [],
    latestMarketPrices: [],
    portfolioId: "p1",
    ...overrides,
  };
}

describe("computeAssetStaleness", () => {
  it("returns estimated for assets with no market price", () => {
    const map = computeAssetStaleness(["a1", "a2"], [], NOW);
    expect(map.get("a1")).toBe("estimated");
    expect(map.get("a2")).toBe("estimated");
  });

  it("returns fresh when observed_at is within 2h", () => {
    const map = computeAssetStaleness(
      ["a1"],
      [
        {
          asset_id: "a1",
          price_usd: 100,
          observed_at: ONE_HOUR_AGO,
          delayed_until: null,
        },
      ],
      NOW,
    );
    expect(map.get("a1")).toBe("fresh");
  });

  it("returns stale when observed_at is older than 2h", () => {
    const map = computeAssetStaleness(
      ["a1"],
      [
        {
          asset_id: "a1",
          price_usd: 100,
          observed_at: THREE_HOURS_AGO,
          delayed_until: null,
        },
      ],
      NOW,
    );
    expect(map.get("a1")).toBe("stale");
  });

  it("uses the first row per asset as the latest quote", () => {
    const map = computeAssetStaleness(
      ["a1"],
      [
        {
          asset_id: "a1",
          price_usd: 100,
          observed_at: ONE_HOUR_AGO,
          delayed_until: null,
        },
        {
          asset_id: "a1",
          price_usd: 200,
          observed_at: THREE_HOURS_AGO,
          delayed_until: null,
        },
      ],
      NOW,
    );
    expect(map.get("a1")).toBe("fresh");
  });
});

describe("buildSnapshotAssets", () => {
  it("returns assets sorted by ticker with derived staleness", () => {
    const data = dashboardData({
      assets: [
        { id: "a2", ticker: "NVDA", name: null, sector: null, country: null },
        { id: "a1", ticker: "AAPL", name: "Apple", sector: null, country: null },
      ],
      latestMarketPrices: [
        {
          asset_id: "a1",
          price_usd: 150,
          observed_at: THREE_HOURS_AGO,
          delayed_until: null,
        },
      ],
    });
    const staleness = computeAssetStaleness(
      ["a1", "a2"],
      data.latestMarketPrices,
      NOW,
    );
    const assets: SnapshotAsset[] = buildSnapshotAssets(data, staleness);
    expect(assets.map((a) => a.ticker)).toEqual(["AAPL", "NVDA"]);
    expect(assets[0].staleness).toBe("stale");
    expect(assets[0].isStale).toBe(true);
    expect(assets[0].isEstimated).toBe(false);
    expect(assets[0].observedAt).toBe(THREE_HOURS_AGO);
    expect(assets[1].staleness).toBe("estimated");
    expect(assets[1].isEstimated).toBe(true);
    expect(assets[1].observedAt).toBeNull();
  });
});

describe("buildBenchmarkSeries", () => {
  it("returns null for fewer than 2 points", () => {
    expect(buildBenchmarkSeries([], NOW)).toBeNull();
    expect(
      buildBenchmarkSeries(
        [{ observed_at: ONE_HOUR_AGO, price_usd: 100 }],
        NOW,
      ),
    ).toBeNull();
  });

  it("normalizes the first point to 100 and scales the rest", () => {
    const series = buildBenchmarkSeries(
      [
        { observed_at: FIVE_DAYS_AGO, price_usd: 100 },
        { observed_at: THREE_DAYS_AGO, price_usd: 110 },
        { observed_at: ONE_HOUR_AGO, price_usd: 121 },
      ],
      NOW,
    );
    expect(series).not.toBeNull();
    expect(series!.normalizedTo).toBe(100);
    expect(series!.from).toBe(FIVE_DAYS_AGO);
    expect(series!.to).toBe(ONE_HOUR_AGO);
    expect(series!.points[0].value).toBeCloseTo(100, 9);
    expect(series!.points[1].value).toBeCloseTo(110, 9);
    expect(series!.points[2].value).toBeCloseTo(121, 9);
  });

  it("flags the series as stale when last point is older than 7 days", () => {
    const series = buildBenchmarkSeries(
      [
        { observed_at: TEN_DAYS_AGO, price_usd: 100 },
        { observed_at: EIGHT_DAYS_AGO, price_usd: 105 },
      ],
      NOW,
    );
    expect(series).not.toBeNull();
    expect(series!.isStale).toBe(true);
  });

  it("sorts input out of order before normalizing", () => {
    const series = buildBenchmarkSeries(
      [
        { observed_at: THREE_DAYS_AGO, price_usd: 110 },
        { observed_at: FIVE_DAYS_AGO, price_usd: 100 },
        { observed_at: ONE_HOUR_AGO, price_usd: 121 },
      ],
      NOW,
    );
    expect(series!.from).toBe(FIVE_DAYS_AGO);
    expect(series!.points[0].value).toBeCloseTo(100, 9);
    expect(series!.points[1].value).toBeCloseTo(110, 9);
    expect(series!.points[2].value).toBeCloseTo(121, 9);
  });

  it("returns null when the first price is invalid (zero or NaN)", () => {
    expect(
      buildBenchmarkSeries(
        [
          { observed_at: FIVE_DAYS_AGO, price_usd: 0 },
          { observed_at: THREE_DAYS_AGO, price_usd: 100 },
        ],
        NOW,
      ),
    ).toBeNull();
  });
});

describe("dedupBenchmarkRowsPerUtcDay", () => {
  it("keeps the most recent row per UTC day and returns ascending order", () => {
    const rows = [
      { observed_at: "2025-06-15T10:00:00Z", price_usd: 100 },
      { observed_at: "2025-06-15T14:30:00Z", price_usd: 101 },
      { observed_at: "2025-06-15T09:00:00Z", price_usd: 99 },
      { observed_at: "2025-06-14T16:00:00Z", price_usd: 95 },
      { observed_at: "2025-06-14T10:00:00Z", price_usd: 94 },
    ];
    const result = dedupBenchmarkRowsPerUtcDay(rows);
    expect(result).toHaveLength(2);
    expect(result[0].observed_at).toBe("2025-06-14T16:00:00Z");
    expect(result[0].price_usd).toBe(95);
    expect(result[1].observed_at).toBe("2025-06-15T14:30:00Z");
    expect(result[1].price_usd).toBe(101);
  });

  it("returns empty array for empty input", () => {
    expect(dedupBenchmarkRowsPerUtcDay([])).toEqual([]);
  });

  it("handles a single row", () => {
    const rows = [{ observed_at: "2025-06-15T10:00:00Z", price_usd: 100 }];
    expect(dedupBenchmarkRowsPerUtcDay(rows)).toEqual(rows);
  });

  it("preserves distinct days when each has a single row", () => {
    const rows = [
      { observed_at: "2025-06-13T10:00:00Z", price_usd: 90 },
      { observed_at: "2025-06-14T10:00:00Z", price_usd: 95 },
      { observed_at: "2025-06-15T10:00:00Z", price_usd: 100 },
    ];
    const result = dedupBenchmarkRowsPerUtcDay(rows);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.observed_at)).toEqual([
      "2025-06-13T10:00:00Z",
      "2025-06-14T10:00:00Z",
      "2025-06-15T10:00:00Z",
    ]);
  });

  it("keeps the latest intraday row when multiple sources exist for same day", () => {
    const rows = [
      { observed_at: "2025-06-15T00:00:00Z", price_usd: 100 },
      { observed_at: "2025-06-15T14:30:00Z", price_usd: 101 },
      { observed_at: "2025-06-15T16:00:00Z", price_usd: 102 },
    ];
    const result = dedupBenchmarkRowsPerUtcDay(rows);
    expect(result).toHaveLength(1);
    expect(result[0].price_usd).toBe(102);
  });
});
