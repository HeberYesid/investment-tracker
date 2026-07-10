import { describe, expect, it } from "vitest";

import {
  isFxStale,
  isQuoteStale,
  normalizeRangeParam,
} from "@/lib/market-data/config";
import {
  STALE_FX_MS,
  STALE_PRICE_MS,
  YAHOO_INTERVAL_BY_RANGE,
  isYahooRange,
  type YahooRange,
} from "@/lib/market-data/types";

describe("normalizeRangeParam", () => {
  it("returns 1y for null and empty values", () => {
    expect(normalizeRangeParam(null)).toBe("1y");
    expect(normalizeRangeParam(undefined)).toBe("1y");
    expect(normalizeRangeParam("")).toBe("1y");
  });

  it("accepts the canonical Yahoo ranges (lowercased)", () => {
    expect(normalizeRangeParam("1mo")).toBe<YahooRange>("1mo");
    expect(normalizeRangeParam("6MO")).toBe<YahooRange>("6mo");
    expect(normalizeRangeParam("YTD")).toBe<YahooRange>("ytd");
    expect(normalizeRangeParam("max")).toBe<YahooRange>("max");
  });

  it("falls back to 1y for unsupported values", () => {
    expect(normalizeRangeParam("13mo")).toBe<YahooRange>("1y");
    expect(normalizeRangeParam("garbage")).toBe<YahooRange>("1y");
  });

  it("is consistent with isYahooRange", () => {
    for (const candidate of [
      "1mo",
      "3mo",
      "6mo",
      "1y",
      "2y",
      "5y",
      "10y",
      "ytd",
      "max",
    ]) {
      expect(isYahooRange(normalizeRangeParam(candidate))).toBe(true);
    }
  });
});

describe("YAHOO_INTERVAL_BY_RANGE", () => {
  it("uses daily granularity for short ranges", () => {
    expect(YAHOO_INTERVAL_BY_RANGE["1mo"]).toBe("1d");
    expect(YAHOO_INTERVAL_BY_RANGE["3mo"]).toBe("1d");
    expect(YAHOO_INTERVAL_BY_RANGE["6mo"]).toBe("1d");
    expect(YAHOO_INTERVAL_BY_RANGE["1y"]).toBe("1d");
    expect(YAHOO_INTERVAL_BY_RANGE["2y"]).toBe("1d");
  });

  it("uses weekly granularity for medium ranges", () => {
    expect(YAHOO_INTERVAL_BY_RANGE["5y"]).toBe("1wk");
    expect(YAHOO_INTERVAL_BY_RANGE["10y"]).toBe("1wk");
  });

  it("uses monthly granularity for max", () => {
    expect(YAHOO_INTERVAL_BY_RANGE["max"]).toBe("1mo");
  });
});

describe("isQuoteStale", () => {
  const now = new Date("2026-06-13T12:00:00Z");

  it("returns true for a quote older than the price threshold", () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    expect(isQuoteStale(threeHoursAgo.toISOString(), now)).toBe(true);
  });

  it("returns false for a quote inside the price threshold", () => {
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isQuoteStale(oneHourAgo.toISOString(), now)).toBe(false);
  });

  it("uses a custom threshold when provided", () => {
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    expect(isQuoteStale(tenMinutesAgo.toISOString(), now, 5 * 60 * 1000)).toBe(
      true,
    );
  });

  it("returns true for an unparseable timestamp", () => {
    expect(isQuoteStale("not-a-date", now)).toBe(true);
  });

  it("uses the default price stale window by default", () => {
    expect(STALE_PRICE_MS).toBe(2 * 60 * 60 * 1000);
    const justOver = new Date(now.getTime() - (STALE_PRICE_MS + 1)).toISOString();
    expect(isQuoteStale(justOver, now)).toBe(true);
    const justUnder = new Date(now.getTime() - (STALE_PRICE_MS - 1)).toISOString();
    expect(isQuoteStale(justUnder, now)).toBe(false);
  });
});

describe("isFxStale", () => {
  const now = new Date("2026-06-13T12:00:00Z");

  it("returns false for rates inside the 24h window", () => {
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    expect(isFxStale(twelveHoursAgo.toISOString(), now)).toBe(false);
  });

  it("returns true for rates older than 24h", () => {
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    expect(isFxStale(twoDaysAgo.toISOString(), now)).toBe(true);
  });

  it("uses STALE_FX_MS by default", () => {
    expect(STALE_FX_MS).toBe(24 * 60 * 60 * 1000);
  });
});
