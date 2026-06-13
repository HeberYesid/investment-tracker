import { describe, expect, it } from "vitest";

import { calculateDrawdown } from "@/lib/calculations/drawdown";

describe("calculateDrawdown", () => {
  it("returns empty series for empty input", () => {
    expect(calculateDrawdown([])).toEqual({ series: [], maxDrawdownPct: 0 });
  });

  it("returns zero drawdown for monotonically non-decreasing values", () => {
    const result = calculateDrawdown([
      { date: "2025-01-01", valueUsd: 1000 },
      { date: "2025-02-01", valueUsd: 1500 },
      { date: "2025-03-01", valueUsd: 2000 },
    ]);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.series.every((p) => p.drawdownPct === 0)).toBe(true);
  });

  it("identifies the peak-to-trough decline correctly", () => {
    const result = calculateDrawdown([
      { date: "2025-01-01", valueUsd: 1000 },
      { date: "2025-02-01", valueUsd: 1500 },
      { date: "2025-03-01", valueUsd: 1200 },
    ]);
    expect(result.maxDrawdownPct).toBe(-20);
    const trough = result.series.find((p) => p.date === "2025-03-01");
    expect(trough).toEqual({
      date: "2025-03-01",
      valueUsd: 1200,
      peakUsd: 1500,
      drawdownPct: -20,
    });
  });

  it("keeps the peak running", () => {
    const result = calculateDrawdown([
      { date: "2025-01-01", valueUsd: 2000 },
      { date: "2025-02-01", valueUsd: 1500 },
      { date: "2025-03-01", valueUsd: 1800 },
    ]);
    const mid = result.series.find((p) => p.date === "2025-02-01");
    expect(mid?.peakUsd).toBe(2000);
    expect(mid?.drawdownPct).toBe(-25);
  });
});
