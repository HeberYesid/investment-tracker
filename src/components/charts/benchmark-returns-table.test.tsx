import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import {
  BenchmarkReturnsTable,
  computeAnnualReturns,
} from "@/components/charts/benchmark-returns-table";
import type {
  BenchmarkSeries,
  EvolutionResponse,
} from "@/lib/validations/dashboard";

function makeBenchmark(points: { date: string; value: number }[]): BenchmarkSeries {
  return {
    symbol: "^GSPC",
    label: "S&P 500",
    normalizedTo: 100,
    from: points[0]?.date ?? "2024-01-02",
    to: points[points.length - 1]?.date ?? "2024-12-30",
    points,
    lastObservedAt: points[points.length - 1]?.date ?? null,
    isStale: false,
  };
}

function makeEvolution(points: { date: string; valueUsd: number }[]): EvolutionResponse {
  return {
    granularity: "monthly",
    from: points[0]?.date ?? "2023-01-28",
    to: points[points.length - 1]?.date ?? "2024-12-28",
    points,
  };
}

const fixedNow = new Date("2024-12-15T12:00:00Z");

describe("computeAnnualReturns", () => {
  it("returns an empty list when either series is empty", () => {
    const empty = makeEvolution([]);
    const full = makeBenchmark([{ date: "2024-12-30", value: 140 }]);
    expect(computeAnnualReturns(empty, full, fixedNow)).toEqual([]);
    expect(computeAnnualReturns(makeEvolution([{ date: "2024-01-28", valueUsd: 1000 }]), makeBenchmark([]), fixedNow)).toEqual([]);
  });

  it("computes per-year returns for two closed years and a YTD row", () => {
    const evolution = makeEvolution([
      { date: "2021-12-28", valueUsd: 900 },
      { date: "2022-12-28", valueUsd: 1000 },
      { date: "2023-12-28", valueUsd: 1100 },
      { date: "2024-06-28", valueUsd: 1210 },
      { date: "2024-12-15", valueUsd: 1320 },
    ]);
    const benchmark = makeBenchmark([
      { date: "2021-12-30", value: 95 },
      { date: "2022-12-30", value: 100 },
      { date: "2023-12-29", value: 108 },
      { date: "2024-06-28", value: 115 },
      { date: "2024-12-13", value: 122 },
    ]);

    const rows = computeAnnualReturns(evolution, benchmark, fixedNow);

    expect(rows).toHaveLength(3);
    expect(rows[0].isYtd).toBe(true);
    expect(rows[0].year).toBe(2024);
    expect(rows[0].portfolio).toBeCloseTo(20, 1);
    expect(rows[0].benchmark).toBeCloseTo(12.96, 1);

    const y2023 = rows.find((r) => !r.isYtd && r.year === 2023);
    expect(y2023?.portfolio).toBeCloseTo(10, 1);
    expect(y2023?.benchmark).toBeCloseTo(8, 1);

    const y2022 = rows.find((r) => !r.isYtd && r.year === 2022);
    expect(y2022?.portfolio).toBeCloseTo(11.11, 1);
    expect(y2022?.benchmark).toBeCloseTo(5.26, 1);
  });

  it("returns N/A for the YTD row when there is no prior-year baseline", () => {
    const evolution = makeEvolution([
      { date: "2024-05-28", valueUsd: 1000 },
      { date: "2024-12-15", valueUsd: 1100 },
    ]);
    const benchmark = makeBenchmark([
      { date: "2024-04-01", value: 100 },
      { date: "2024-12-13", value: 110 },
    ]);

    const rows = computeAnnualReturns(evolution, benchmark, fixedNow);
    const ytd = rows.find((r) => r.isYtd);
    expect(ytd).toBeDefined();
    expect(ytd?.portfolio).toBeNull();
    expect(ytd?.benchmark).toBeNull();
  });
});

describe("BenchmarkReturnsTable", () => {
  it("renders the empty state when there is no data", () => {
    render(
      createElement(BenchmarkReturnsTable, {
        evolution: makeEvolution([]),
        benchmark: makeBenchmark([]),
        now: fixedNow,
      }),
    );
    expect(screen.getByTestId("benchmark-returns-table")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sin datos suficientes para calcular el rendimiento anual.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a YTD row plus closed years with portfolio, S&P 500, and difference columns", () => {
    const evolution = makeEvolution([
      { date: "2021-12-28", valueUsd: 900 },
      { date: "2022-12-28", valueUsd: 1000 },
      { date: "2023-12-28", valueUsd: 1100 },
      { date: "2024-06-28", valueUsd: 1210 },
      { date: "2024-12-15", valueUsd: 1320 },
    ]);
    const benchmark = makeBenchmark([
      { date: "2021-12-30", value: 95 },
      { date: "2022-12-30", value: 100 },
      { date: "2023-12-29", value: 108 },
      { date: "2024-06-28", value: 115 },
      { date: "2024-12-13", value: 122 },
    ]);

    render(
      createElement(BenchmarkReturnsTable, {
        evolution,
        benchmark,
        now: fixedNow,
      }),
    );

    const table = screen.getByTestId("benchmark-returns-table");
    const ytdRow = within(table).getByText("YTD 2024").closest("tr");
    expect(ytdRow).not.toBeNull();
    const ytdCells = within(ytdRow as HTMLElement).getAllByRole("cell");
    expect(ytdCells[1]).toHaveTextContent("+20,0%");
    expect(ytdCells[2]).toHaveTextContent("+13,0%");
    expect(ytdCells[3]).toHaveTextContent("+7,0%");

    const y2023Row = within(table).getByText("2023").closest("tr");
    expect(y2023Row).not.toBeNull();
    const y2023Cells = within(y2023Row as HTMLElement).getAllByRole("cell");
    expect(y2023Cells[1]).toHaveTextContent("+10,0%");
    expect(y2023Cells[2]).toHaveTextContent("+8,0%");
    expect(y2023Cells[3]).toHaveTextContent("+2,0%");
  });
});
