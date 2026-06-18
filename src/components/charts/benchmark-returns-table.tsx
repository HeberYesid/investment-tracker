"use client";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type {
  BenchmarkSeries,
  EvolutionResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const pctFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

type DatedPoint = { date: string };

type YearReturn = {
  year: number;
  isYtd: boolean;
  portfolio: number | null;
  benchmark: number | null;
};

function dateKey(date: string): string {
  return date.slice(0, 10);
}

function findLastOnOrBefore<T extends DatedPoint>(
  sorted: T[],
  target: string,
): T | null {
  if (sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let result: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const key = dateKey(sorted[mid].date);
    if (key <= target) {
      result = sorted[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function computeReturn(
  start: number | null,
  end: number | null,
): number | null {
  if (start === null || end === null) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return null;
  }
  return ((end - start) / start) * 100;
}

function formatPct(value: number | null): string {
  if (value === null) return labels.benchmarkReturnsNa;
  return `${value >= 0 ? "+" : ""}${pctFormatter.format(value / 100)}`;
}

function deltaToneClass(value: number | null): string {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-slate-700";
}

function returnToneClass(value: number | null): string {
  if (value === null) return "text-slate-500";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-slate-700";
}

export function computeAnnualReturns(
  evolution: EvolutionResponse,
  benchmark: BenchmarkSeries,
  now: Date = new Date(),
): YearReturn[] {
  const sortedEvolution = [...evolution.points].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const sortedBenchmark = [...benchmark.points].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (sortedEvolution.length === 0 || sortedBenchmark.length === 0) {
    return [];
  }

  const years = new Set<number>();
  for (const p of sortedEvolution) {
    const y = Number(dateKey(p.date).slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  for (const p of sortedBenchmark) {
    const y = Number(dateKey(p.date).slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }

  const currentYear = now.getUTCFullYear();
  const rows: YearReturn[] = [];
  for (const year of years) {
    const yearEnd = `${year}-12-31`;
    const prevYearEnd = `${year - 1}-12-31`;
    const portfolioStart = findLastOnOrBefore(sortedEvolution, prevYearEnd);
    const portfolioEnd = findLastOnOrBefore(sortedEvolution, yearEnd);
    const benchmarkStart = findLastOnOrBefore(sortedBenchmark, prevYearEnd);
    const benchmarkEnd = findLastOnOrBefore(sortedBenchmark, yearEnd);
    rows.push({
      year,
      isYtd: false,
      portfolio: computeReturn(
        portfolioStart?.valueUsd ?? null,
        portfolioEnd?.valueUsd ?? null,
      ),
      benchmark: computeReturn(
        benchmarkStart?.value ?? null,
        benchmarkEnd?.value ?? null,
      ),
    });
  }

  const lastEvolution = sortedEvolution[sortedEvolution.length - 1];
  const lastBenchmark = sortedBenchmark[sortedBenchmark.length - 1];
  const ytdPortfolioStart = findLastOnOrBefore(
    sortedEvolution,
    `${currentYear - 1}-12-31`,
  );
  const ytdBenchmarkStart = findLastOnOrBefore(
    sortedBenchmark,
    `${currentYear - 1}-12-31`,
  );
  const ytdRow: YearReturn = {
    year: currentYear,
    isYtd: true,
    portfolio: computeReturn(
      ytdPortfolioStart?.valueUsd ?? null,
      lastEvolution.valueUsd,
    ),
    benchmark: computeReturn(
      ytdBenchmarkStart?.value ?? null,
      lastBenchmark.value,
    ),
  };

  const filteredClosed = rows
    .filter((r) => r.year !== currentYear)
    .filter((r) => r.portfolio !== null || r.benchmark !== null);

  const all = [ytdRow, ...filteredClosed];
  all.sort((a, b) => {
    if (a.isYtd && !b.isYtd) return -1;
    if (!a.isYtd && b.isYtd) return 1;
    return b.year - a.year;
  });
  return all;
}

interface BenchmarkReturnsTableProps {
  evolution: EvolutionResponse;
  benchmark: BenchmarkSeries;
  now?: Date;
}

export function BenchmarkReturnsTable({
  evolution,
  benchmark,
  now,
}: BenchmarkReturnsTableProps) {
  const rows = computeAnnualReturns(evolution, benchmark, now);

  return (
    <section
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="benchmark-returns-table"
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {labels.benchmarkReturnsTitle}
      </h2>

      <div className="mt-4 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {labels.benchmarkReturnsEmpty}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="pb-2">{labels.benchmarkReturnsYear}</th>
                <th className="pb-2 text-right">
                  {labels.benchmarkReturnsPortfolio}
                </th>
                <th className="pb-2 text-right">
                  {labels.benchmarkReturnsSp500}
                </th>
                <th className="pb-2 text-right">
                  {labels.benchmarkReturnsDelta}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta =
                  row.portfolio !== null && row.benchmark !== null
                    ? row.portfolio - row.benchmark
                    : null;
                const yearLabel = row.isYtd
                  ? labels.benchmarkReturnsYtd(row.year)
                  : String(row.year);
                return (
                  <tr
                    key={`${row.year}-${row.isYtd ? "ytd" : "full"}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="py-2 font-medium text-slate-950">
                      {yearLabel}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${returnToneClass(row.portfolio)}`}
                    >
                      {formatPct(row.portfolio)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${returnToneClass(row.benchmark)}`}
                    >
                      {formatPct(row.benchmark)}
                    </td>
                    <td
                      className={`py-2 text-right font-mono font-semibold ${deltaToneClass(delta)}`}
                    >
                      {formatPct(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
