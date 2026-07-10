import { describe, expect, it } from "vitest";

import { summarizeLatestFxRate } from "@/lib/validations/fx";

const NOW = new Date("2025-06-15T12:00:00Z");
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString();
const TWENTY_THREE_HOURS_AGO = new Date(
  NOW.getTime() - 23 * 60 * 60 * 1000,
).toISOString();
const TWO_DAYS_AGO = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

describe("summarizeLatestFxRate", () => {
  it("returns nulls when there is no rate row", () => {
    expect(summarizeLatestFxRate(null, NOW)).toEqual({
      rate: null,
      observedAt: null,
      isStale: false,
      source: null,
    });
  });

  it("marks a fresh rate (<24h) as not stale", () => {
    const result = summarizeLatestFxRate(
      {
        rate: 4250.32,
        observed_at: ONE_HOUR_AGO,
        source: "open.er-api.com",
      },
      NOW,
    );
    expect(result.rate).toBe(4250.32);
    expect(result.observedAt).toBe(ONE_HOUR_AGO);
    expect(result.isStale).toBe(false);
    expect(result.source).toBe("open.er-api.com");
  });

  it("marks a rate within 24h as fresh (boundary)", () => {
    const result = summarizeLatestFxRate(
      {
        rate: 4250,
        observed_at: TWENTY_THREE_HOURS_AGO,
        source: "open.er-api.com",
      },
      NOW,
    );
    expect(result.isStale).toBe(false);
  });

  it("marks a rate older than 24h as stale", () => {
    const result = summarizeLatestFxRate(
      {
        rate: 4250,
        observed_at: TWO_DAYS_AGO,
        source: "open.er-api.com",
      },
      NOW,
    );
    expect(result.isStale).toBe(true);
  });

  it("treats an invalid observed_at as stale", () => {
    const result = summarizeLatestFxRate(
      {
        rate: 4250,
        observed_at: "not-a-date",
        source: "open.er-api.com",
      },
      NOW,
    );
    expect(result.isStale).toBe(true);
  });
});
