import { describe, expect, it } from "vitest";

import { getDashboardLabels } from "@/lib/i18n/dashboard";

import { formatRelativeTime } from "./format-last-updated";

const NOW = new Date("2026-06-25T12:00:00.000Z");
const { relativeTimeFallback } = getDashboardLabels();
const labels = { relativeTimeFallback };

function isoOffset(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("formatRelativeTime", () => {
  it('returns "hace segundos" for a date a few seconds in the past', () => {
    const result = formatRelativeTime(isoOffset(30 * 1000), labels, NOW);
    expect(result).toMatch(/segundos?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("returns a minutes bucket for ~5 minutes ago", () => {
    const result = formatRelativeTime(isoOffset(5 * 60 * 1000), labels, NOW);
    expect(result).toMatch(/minutos?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("returns an hours bucket for ~2 hours ago", () => {
    const result = formatRelativeTime(isoOffset(2 * 60 * 60 * 1000), labels, NOW);
    expect(result).toMatch(/horas?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("returns a days bucket for ~3 days ago", () => {
    const result = formatRelativeTime(isoOffset(3 * 24 * 60 * 60 * 1000), labels, NOW);
    expect(result).toMatch(/d[ií]as?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("returns a weeks bucket for ~2 weeks ago", () => {
    const result = formatRelativeTime(isoOffset(14 * 24 * 60 * 60 * 1000), labels, NOW);
    expect(result).toMatch(/semanas?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("returns a months bucket for ~1 month ago", () => {
    // With Intl.RelativeTimeFormat numeric: "auto" the value 1 collapses to
    // the natural "el mes pasado"; we only assert the bucket word appears.
    const result = formatRelativeTime(isoOffset(35 * 24 * 60 * 60 * 1000), labels, NOW);
    expect(result.toLowerCase()).toMatch(/mes(es)?/);
  });

  it("uses the natural 'ayer' form for ~1 day ago when numeric: auto is on", () => {
    const result = formatRelativeTime(isoOffset(1 * 24 * 60 * 60 * 1000), labels, NOW);
    expect(result.toLowerCase()).toBe("ayer");
  });

  it("returns a years bucket for ~2 years ago", () => {
    const result = formatRelativeTime(
      isoOffset(2 * 365 * 24 * 60 * 60 * 1000),
      labels,
      NOW,
    );
    expect(result).toMatch(/a[ñn]os?/i);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("uses the relativeTimeFallback label when the date is in the future", () => {
    const futureIso = new Date(NOW.getTime() + 60 * 1000).toISOString();
    const result = formatRelativeTime(futureIso, labels, NOW);
    expect(result).toBe(relativeTimeFallback);
  });

  it("returns a non-empty string for a very old date (>1 year)", () => {
    const result = formatRelativeTime(
      isoOffset(10 * 365 * 24 * 60 * 60 * 1000),
      labels,
      NOW,
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.toLowerCase()).toContain("hace");
  });

  it("uses the relativeTimeFallback label for an unparseable ISO string", () => {
    const result = formatRelativeTime("not-a-date", labels, NOW);
    expect(result).toBe(relativeTimeFallback);
  });

  it("derives the relativeTimeFallback from the i18n dictionary", () => {
    // Sanity check: the dictionary entry is the same string we use as the
    // fallback, so a typo in i18n/dashboard.ts would surface here.
    expect(getDashboardLabels().relativeTimeFallback).toBe("recién");
  });
});
