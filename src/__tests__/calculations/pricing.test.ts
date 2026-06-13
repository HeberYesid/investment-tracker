import { describe, expect, it } from "vitest";

import { resolveAssetPrice } from "@/lib/calculations/pricing";

describe("resolveAssetPrice", () => {
  it("returns the market price when a current one is provided", () => {
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: {
        asset_id: "a1",
        price_usd: 150,
        observed_at: "2025-06-01T00:00:00Z",
        delayed_until: null,
      },
      fallbackTradePriceUsd: 100,
    });
    expect(result).toEqual({
      priceUsd: 150,
      isEstimated: false,
      source: "MARKET",
    });
  });

  it("ignores a market price whose delayed_until is in the future", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: {
        asset_id: "a1",
        price_usd: 999,
        observed_at: "2025-06-01T00:00:00Z",
        delayed_until: future,
      },
      fallbackTradePriceUsd: 100,
    });
    expect(result).toEqual({
      priceUsd: 100,
      isEstimated: true,
      source: "TRADE_FALLBACK",
    });
  });

  it("falls back to the trade price when no market price is provided", () => {
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: undefined,
      fallbackTradePriceUsd: 100,
    });
    expect(result.isEstimated).toBe(true);
    expect(result.source).toBe("TRADE_FALLBACK");
    expect(result.priceUsd).toBe(100);
  });

  it("returns zero with isEstimated when no price and no fallback exist", () => {
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: undefined,
      fallbackTradePriceUsd: undefined,
    });
    expect(result).toEqual({
      priceUsd: 0,
      isEstimated: true,
      source: "TRADE_FALLBACK",
    });
  });

  it("ignores a market price that belongs to a different asset", () => {
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: {
        asset_id: "a2",
        price_usd: 200,
        observed_at: "2025-06-01T00:00:00Z",
        delayed_until: null,
      },
      fallbackTradePriceUsd: 100,
    });
    expect(result.isEstimated).toBe(true);
    expect(result.priceUsd).toBe(100);
  });

  it("accepts a market price whose delayed_until is in the past", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const result = resolveAssetPrice({
      assetId: "a1",
      latestMarketPrice: {
        asset_id: "a1",
        price_usd: 175,
        observed_at: "2025-06-01T00:00:00Z",
        delayed_until: past,
      },
      fallbackTradePriceUsd: 100,
    });
    expect(result).toEqual({
      priceUsd: 175,
      isEstimated: false,
      source: "MARKET",
    });
  });
});
