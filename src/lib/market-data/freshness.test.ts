import { describe, expect, it } from "vitest";
import {
  evaluateFreshness,
  getMarketDataFreshness,
  type MarketDataFreshness,
} from "./freshness";

function baseFreshness(
  overrides: Partial<MarketDataFreshness> = {},
): MarketDataFreshness {
  return {
    latestPriceObservedAt: null,
    lastSyncStartedAt: null,
    lastSyncFinishedAt: null,
    ...overrides,
  };
}

describe("evaluateFreshness", () => {
  const NOW = new Date("2026-07-02T12:00:00.000Z");

  it("pricesStale = true when latestPriceObservedAt is null", () => {
    const result = evaluateFreshness(baseFreshness(), NOW);
    expect(result.pricesStale).toBe(true);
  });

  it("pricesStale = false when observed less than 30 min ago", () => {
    const result = evaluateFreshness(
      baseFreshness({ latestPriceObservedAt: "2026-07-02T11:35:00.000Z" }),
      NOW,
    );
    expect(result.pricesStale).toBe(false);
  });

  it("pricesStale = true when observed more than 30 min ago", () => {
    const result = evaluateFreshness(
      baseFreshness({ latestPriceObservedAt: "2026-07-02T11:20:00.000Z" }),
      NOW,
    );
    expect(result.pricesStale).toBe(true);
  });

  it("recentSyncAttempt = true when a sync started within 30 min", () => {
    const result = evaluateFreshness(
      baseFreshness({ lastSyncStartedAt: "2026-07-02T11:40:00.000Z" }),
      NOW,
    );
    expect(result.recentSyncAttempt).toBe(true);
  });

  it("recentSyncAttempt = false when last sync started >30 min ago", () => {
    const result = evaluateFreshness(
      baseFreshness({ lastSyncStartedAt: "2026-07-02T11:00:00.000Z" }),
      NOW,
    );
    expect(result.recentSyncAttempt).toBe(false);
  });

  it("recentSyncAttempt = false when lastSyncStartedAt is null", () => {
    const result = evaluateFreshness(baseFreshness(), NOW);
    expect(result.recentSyncAttempt).toBe(false);
  });

  it("shouldBackgroundSync = false when prices are fresh", () => {
    const result = evaluateFreshness(
      baseFreshness({
        latestPriceObservedAt: "2026-07-02T11:50:00.000Z",
        lastSyncStartedAt: null,
      }),
      NOW,
    );
    expect(result.shouldBackgroundSync).toBe(false);
  });

  it("shouldBackgroundSync = true when prices stale and no recent attempt", () => {
    const result = evaluateFreshness(
      baseFreshness({
        latestPriceObservedAt: "2026-07-02T10:00:00.000Z",
        lastSyncStartedAt: null,
      }),
      NOW,
    );
    expect(result.shouldBackgroundSync).toBe(true);
  });

  it("shouldBackgroundSync = false on weekend no-thrash: stale observed_at but recent sync attempt", () => {
    const result = evaluateFreshness(
      baseFreshness({
        latestPriceObservedAt: "2026-07-02T07:00:00.000Z",
        lastSyncStartedAt: "2026-07-02T11:50:00.000Z",
      }),
      NOW,
    );
    expect(result.pricesStale).toBe(true);
    expect(result.recentSyncAttempt).toBe(true);
    expect(result.shouldBackgroundSync).toBe(false);
  });
});

describe("getMarketDataFreshness", () => {
  it("returns null when rpc errors", async () => {
    const client = {
      rpc: async () => ({ data: null, error: new Error("fail") }),
    };
    const result = await getMarketDataFreshness(client);
    expect(result).toBeNull();
  });

  it("returns null when data is null", async () => {
    const client = {
      rpc: async () => ({ data: null, error: null }),
    };
    const result = await getMarketDataFreshness(client);
    expect(result).toBeNull();
  });

  it("parses a single row object", async () => {
    const client = {
      rpc: async () => ({
        data: {
          latest_price_observed_at: "2026-07-01T10:00:00Z",
          last_sync_started_at: null,
          last_sync_finished_at: "2026-07-01T09:30:00Z",
        },
        error: null,
      }),
    };
    const result = await getMarketDataFreshness(client);
    expect(result).toEqual({
      latestPriceObservedAt: "2026-07-01T10:00:00Z",
      lastSyncStartedAt: null,
      lastSyncFinishedAt: "2026-07-01T09:30:00Z",
    });
  });

  it("parses from an array row", async () => {
    const client = {
      rpc: async () => ({
        data: [
          {
            latest_price_observed_at: "2026-07-01T10:00:00Z",
            last_sync_started_at: "2026-07-01T09:50:00Z",
            last_sync_finished_at: "2026-07-01T09:30:00Z",
          },
        ],
        error: null,
      }),
    };
    const result = await getMarketDataFreshness(client);
    expect(result).toEqual({
      latestPriceObservedAt: "2026-07-01T10:00:00Z",
      lastSyncStartedAt: "2026-07-01T09:50:00Z",
      lastSyncFinishedAt: "2026-07-01T09:30:00Z",
    });
  });

  it("returns null when array is empty", async () => {
    const client = {
      rpc: async () => ({ data: [], error: null }),
    };
    const result = await getMarketDataFreshness(client);
    expect(result).toBeNull();
  });
});
