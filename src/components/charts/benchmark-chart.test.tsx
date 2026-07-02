import { describe, expect, it } from "vitest";

import {
  buildChartRows,
  interpolateBenchmark,
} from "@/components/charts/benchmark-chart";
import type {
  BenchmarkSeries,
  EvolutionResponse,
} from "@/lib/validations/dashboard";

const benchmark: BenchmarkSeries = {
  symbol: "^GSPC",
  label: "S&P 500",
  normalizedTo: 100,
  from: "2024-01-02",
  to: "2024-12-30",
  points: [
    { date: "2024-01-02", value: 100 },
    { date: "2024-04-01", value: 110 },
    { date: "2024-07-01", value: 120 },
    { date: "2024-10-01", value: 130 },
    { date: "2024-12-30", value: 140 },
  ],
  lastObservedAt: "2024-12-30",
  isStale: false,
};

const evolution: EvolutionResponse = {
  granularity: "monthly",
  from: "2024-01-28",
  to: "2024-12-28",
  isEstimated: false,
  points: [
    { date: "2024-01-28", valueUsd: 1000 },
    { date: "2024-02-28", valueUsd: 1050 },
    { date: "2024-03-28", valueUsd: 1100 },
    { date: "2024-04-28", valueUsd: 1200 },
    { date: "2024-05-28", valueUsd: 1150 },
    { date: "2024-06-28", valueUsd: 1250 },
    { date: "2024-07-28", valueUsd: 1300 },
    { date: "2024-08-28", valueUsd: 1280 },
    { date: "2024-09-28", valueUsd: 1350 },
    { date: "2024-10-28", valueUsd: 1400 },
    { date: "2024-11-28", valueUsd: 1380 },
    { date: "2024-12-28", valueUsd: 1450 },
  ],
};

describe("interpolateBenchmark", () => {
  it("returns null for empty input", () => {
    expect(interpolateBenchmark([], "2024-06-15")).toBeNull();
  });

  it("returns null for an invalid target date", () => {
    expect(interpolateBenchmark(benchmark.points, "not-a-date")).toBeNull();
  });

  it("clamps to the first point when target is before the series", () => {
    expect(interpolateBenchmark(benchmark.points, "2023-12-31")).toBe(100);
  });

  it("clamps to the last point when target is after the series", () => {
    expect(interpolateBenchmark(benchmark.points, "2026-06-15")).toBe(140);
  });

  it("linearly interpolates between two surrounding points", () => {
    const result = interpolateBenchmark(benchmark.points, "2024-02-16");
    expect(result).toBeCloseTo(105, 5);
  });

  it("returns the exact value of a point on a matching date", () => {
    expect(interpolateBenchmark(benchmark.points, "2024-07-01")).toBe(120);
  });
});

describe("buildChartRows", () => {
  it("returns an empty array when there are fewer than two evolution points", () => {
    const single: EvolutionResponse = {
      ...evolution,
      points: [{ date: "2024-01-28", valueUsd: 1000 }],
    };
    expect(buildChartRows(single, benchmark)).toEqual([]);
  });

  it("returns an empty array when the benchmark series is empty", () => {
    const empty: BenchmarkSeries = { ...benchmark, points: [] };
    expect(buildChartRows(evolution, empty)).toEqual([]);
  });

  it("returns an empty array when the first portfolio value is zero", () => {
    const zero: EvolutionResponse = {
      ...evolution,
      points: [{ date: "2024-01-28", valueUsd: 0 }, ...evolution.points.slice(1)],
    };
    expect(buildChartRows(zero, benchmark)).toEqual([]);
  });

  it("normalizes both series to base 100 at the portfolio's first point", () => {
    const rows = buildChartRows(evolution, benchmark);
    expect(rows[0].date).toBe("2024-01-28");
    expect(rows[0].portfolio).toBe(100);
    expect(rows[0].benchmark).toBe(100);
  });

  it("shows real cumulative growth for both series at the end of the range", () => {
    const rows = buildChartRows(evolution, benchmark);
    const last = rows[rows.length - 1];
    expect(last.date).toBe("2024-12-28");
    expect(last.portfolio).toBeCloseTo(145, 5);
    expect(last.benchmark).toBeCloseTo(135.85, 1);
  });

  it("aligns the benchmark series to the portfolio X axis with interpolation", () => {
    const rows = buildChartRows(evolution, benchmark);
    expect(rows).toHaveLength(12);
    expect(rows[2].date).toBe("2024-03-28");
    expect(rows[2].benchmark).not.toBeNull();
  });

  it("hides the S&P 500 line for portfolio points before the first benchmark observation", () => {
    const olderEvolution: EvolutionResponse = {
      granularity: "monthly",
      from: "2023-06-28",
      to: "2024-12-28",
      isEstimated: false,
      points: [
        { date: "2023-06-28", valueUsd: 800 },
        { date: "2023-07-28", valueUsd: 820 },
        { date: "2024-01-28", valueUsd: 1000 },
        { date: "2024-12-28", valueUsd: 1450 },
      ],
    };
    const rows = buildChartRows(olderEvolution, benchmark);
    expect(rows).toHaveLength(4);
    expect(rows[0].benchmark).toBeNull();
    expect(rows[1].benchmark).toBeNull();
    expect(rows[2].benchmark).not.toBeNull();
    expect(rows[2].benchmark).toBeCloseTo(102.89, 1);
    expect(rows[3].benchmark).not.toBeNull();
  });

  it("renders the full portfolio range even when the benchmark series is short", () => {
    const shortBenchmark: BenchmarkSeries = {
      ...benchmark,
      from: "2024-12-25",
      to: "2024-12-30",
      points: [
        { date: "2024-12-25", value: 100 },
        { date: "2024-12-30", value: 140 },
      ],
    };
    const rows = buildChartRows(evolution, shortBenchmark);
    expect(rows).toHaveLength(12);
    const last = rows[rows.length - 1];
    expect(last.date).toBe("2024-12-28");
    expect(last.portfolio).toBeCloseTo(145, 5);
    expect(last.benchmark).not.toBeNull();
  });

  it("marks every benchmark value as null when the benchmark starts after the portfolio's last point", () => {
    const futureBenchmark: BenchmarkSeries = {
      ...benchmark,
      from: "2025-01-15",
      to: "2025-01-20",
      points: [
        { date: "2025-01-15", value: 100 },
        { date: "2025-01-20", value: 105 },
      ],
    };
    const rows = buildChartRows(evolution, futureBenchmark);
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.benchmark === null)).toBe(true);
    expect(rows.every((row) => row.portfolio !== null)).toBe(true);
  });

  it("normalizes the S&P 500 to 100 at the portfolio's first date even when that date falls after the first benchmark observation", () => {
    const laterEvolution: EvolutionResponse = {
      granularity: "monthly",
      from: "2024-09-28",
      to: "2024-12-28",
      isEstimated: false,
      points: [
        { date: "2024-09-28", valueUsd: 1000 },
        { date: "2024-10-28", valueUsd: 1100 },
        { date: "2024-11-28", valueUsd: 1080 },
        { date: "2024-12-28", valueUsd: 1200 },
      ],
    };
    const rows = buildChartRows(laterEvolution, benchmark);
    expect(rows[0].portfolio).toBe(100);
    expect(rows[0].benchmark).toBe(100);
    expect(rows[rows.length - 1].portfolio).toBeCloseTo(120, 5);
  });
});
