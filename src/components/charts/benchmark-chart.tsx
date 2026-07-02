"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { getChartPalette } from "@/lib/theme/chart-palette";
import { useTheme } from "@/lib/theme/theme-provider";
import { SyncNowButton } from "@/features/dashboard/sync-now-button";
import type {
  BenchmarkPoint,
  BenchmarkSeries,
  EvolutionResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const indexFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("es", {
  month: "short",
  year: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

type ChartRow = {
  date: string;
  parsedDate: number;
  portfolio: number | null;
  benchmark: number | null;
};

function safeFormatShortDate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d);
}

function safeFormatLongDate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return longDateFormatter.format(d);
}

export function interpolateBenchmark(
  points: BenchmarkPoint[],
  targetDate: string,
): number | null {
  if (points.length === 0) return null;
  const target = new Date(targetDate).getTime();
  if (Number.isNaN(target)) return null;
  const first = points[0];
  const firstTime = new Date(first.date).getTime();
  if (target <= firstTime) return first.value;
  const last = points[points.length - 1];
  const lastTime = new Date(last.date).getTime();
  if (target >= lastTime) return last.value;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const midTime = new Date(points[mid].date).getTime();
    if (midTime <= target) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const aTime = new Date(a.date).getTime();
  const bTime = new Date(b.date).getTime();
  if (bTime === aTime) return a.value;
  const t = (target - aTime) / (bTime - aTime);
  return a.value + (b.value - a.value) * t;
}

export function buildChartRows(
  evolution: EvolutionResponse,
  benchmark: BenchmarkSeries,
): ChartRow[] {
  if (evolution.points.length < 2) return [];
  if (benchmark.points.length === 0) return [];
  const sortedBenchmark = [...benchmark.points].sort(
    (a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)),
  );
  const portfolioFirstValue = evolution.points[0].valueUsd;
  if (!Number.isFinite(portfolioFirstValue) || portfolioFirstValue <= 0) return [];
  const benchmarkValueAtPortfolioFirst = interpolateBenchmark(
    sortedBenchmark,
    evolution.points[0].date,
  );
  const benchmarkBase =
    benchmarkValueAtPortfolioFirst !== null && benchmarkValueAtPortfolioFirst > 0
      ? benchmarkValueAtPortfolioFirst
      : sortedBenchmark[0].value;
  const benchmarkFirstDate = sortedBenchmark[0].date.slice(0, 10);
  return evolution.points.map((p) => {
    const portfolio = (p.valueUsd / portfolioFirstValue) * 100;
    const benchmarkRaw = interpolateBenchmark(sortedBenchmark, p.date);
    const isBeforeFirstBenchmark = p.date.slice(0, 10) < benchmarkFirstDate;
    const benchmark =
      benchmarkRaw === null || isBeforeFirstBenchmark
        ? null
        : (benchmarkRaw / benchmarkBase) * 100;
    return {
      date: p.date,
      parsedDate: new Date(p.date).getTime(),
      portfolio,
      benchmark,
    };
  });
}

interface BenchmarkChartProps {
  evolution: EvolutionResponse;
  benchmark: BenchmarkSeries;
}

interface CustomTooltipPayload {
  color?: string;
  name?: string;
  value?: number | string | null;
  dataKey?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: CustomTooltipPayload[];
  palette: ReturnType<typeof getChartPalette>;
}

function CustomTooltip({ active, label, payload, palette }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-sm"
      style={{
        backgroundColor: palette.tooltipBg,
        border: `1px solid ${palette.tooltipBorder}`,
        color: palette.text,
      }}
    >
      <p className="font-semibold" style={{ color: palette.text }}>
        {safeFormatLongDate(label)}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry, idx) => {
          const value = typeof entry.value === "number" ? entry.value : null;
          if (value === null) return null;
          return (
            <li
              key={idx}
              className="flex items-center gap-2 font-mono"
              style={{ color: palette.text }}
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: entry.color ?? palette.fallbackSwatch }}
              />
              <span style={{ color: palette.axis }}>{entry.name}</span>
              <span className="ml-auto font-semibold" style={{ color: palette.text }}>
                {indexFormatter.format(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function pctToneClass(value: number | null): string {
  if (value === null) return "text-text-muted";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-text-secondary";
}

function formatIndex(value: number | null): string {
  if (value === null) return labels.benchmarkReturnsNa;
  return indexFormatter.format(value);
}

function formatSignedDelta(value: number | null): string {
  if (value === null) return labels.benchmarkReturnsNa;
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value.toFixed(1)} pts`;
}

export function BenchmarkChart({ evolution, benchmark }: BenchmarkChartProps) {
  const { resolvedTheme } = useTheme();
  const palette = getChartPalette(resolvedTheme);
  const sectionClass =
    "rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle";
  const titleClass = "text-lg font-semibold text-text-primary";
  const rows = buildChartRows(evolution, benchmark);
  if (rows.length < 2) {
    return (
      <section
        className={sectionClass}
        data-testid="benchmark-chart"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={titleClass}>{labels.benchmarkTitle}</h2>
            <p className="mt-3 text-sm text-text-muted">{labels.benchmarkEmpty}</p>
          </div>
          <SyncNowButton />
        </div>
      </section>
    );
  }

  const hasAnyBenchmarkData = rows.some((row) => row.benchmark !== null);
  if (!hasAnyBenchmarkData) {
    return (
      <section
        className={sectionClass}
        data-testid="benchmark-chart"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={titleClass}>{labels.benchmarkTitle}</h2>
            <p className="mt-1 text-xs text-text-muted">
              {labels.benchmarkSubtitle.replace("{benchmark}", benchmark.label)}
            </p>
          </div>
          <SyncNowButton />
        </div>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rows}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke={palette.grid}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: palette.axis }}
                tickFormatter={safeFormatShortDate}
                stroke={palette.grid}
              />
              <YAxis
                tick={{ fontSize: 11, fill: palette.axis }}
                tickFormatter={(value: number) => indexFormatter.format(value)}
                stroke={palette.grid}
                width={50}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<CustomTooltip palette={palette} />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8, color: palette.text }}
                iconType="plainline"
              />
              <Line
                type="monotone"
                dataKey="portfolio"
                name={labels.benchmarkPortfolioLegend}
                stroke={palette.primary}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p
          className="mt-3 rounded-lg bg-surface-soft px-3 py-2 text-xs text-text-secondary ring-1 ring-border-subtle"
          data-testid="benchmark-no-overlap"
        >
          {labels.benchmarkNoOverlap}
        </p>
      </section>
    );
  }

  const lastRow = rows[rows.length - 1];
  const firstRow = rows[0];
  const portfolioDeltaPct =
    lastRow.portfolio !== null && firstRow.portfolio !== null && firstRow.portfolio !== 0
      ? ((lastRow.portfolio - firstRow.portfolio) / firstRow.portfolio) * 100
      : null;
  const benchmarkDeltaPct =
    lastRow.benchmark !== null && firstRow.benchmark !== null && firstRow.benchmark !== 0
      ? ((lastRow.benchmark - firstRow.benchmark) / firstRow.benchmark) * 100
      : null;
  const indexDelta =
    lastRow.portfolio !== null && lastRow.benchmark !== null
      ? lastRow.portfolio - lastRow.benchmark
      : null;

  return (
    <section
      className={sectionClass}
      data-testid="benchmark-chart"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={titleClass}>{labels.benchmarkTitle}</h2>
          <p className="mt-1 text-xs text-text-muted">
            {labels.benchmarkSubtitle.replace("{benchmark}", benchmark.label)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {benchmark.isStale && (
            <span
              className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
              title={labels.benchmarkStaleTooltip}
            >
              {labels.benchmarkStaleBadge}
            </span>
          )}
          <SyncNowButton />
        </div>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: palette.axis }}
              tickFormatter={safeFormatShortDate}
              stroke={palette.grid}
            />
            <YAxis
              tick={{ fontSize: 11, fill: palette.axis }}
              tickFormatter={(value: number) => indexFormatter.format(value)}
              stroke={palette.grid}
              width={50}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip palette={palette} />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8, color: palette.text }}
              iconType="plainline"
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              name={labels.benchmarkPortfolioLegend}
              stroke={palette.primary}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="benchmark"
              name={benchmark.label}
              stroke={palette.benchmark}
              strokeWidth={2}
              strokeDasharray={palette.benchmarkDash}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-xs text-text-secondary">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            {labels.benchmarkPortfolioLegend}
          </dt>
          <dd className="mt-1 font-mono text-sm text-text-primary">
            {formatIndex(lastRow.portfolio)}
          </dd>
          <dd className={`mt-0.5 font-mono text-xs ${pctToneClass(portfolioDeltaPct)}`}>
            {portfolioDeltaPct === null
              ? labels.benchmarkReturnsNa
              : `${portfolioDeltaPct >= 0 ? "+" : ""}${portfolioDeltaPct.toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            {benchmark.label}
          </dt>
          <dd className="mt-1 font-mono text-sm text-text-primary">
            {formatIndex(lastRow.benchmark)}
          </dd>
          <dd className={`mt-0.5 font-mono text-xs ${pctToneClass(benchmarkDeltaPct)}`}>
            {benchmarkDeltaPct === null
              ? labels.benchmarkReturnsNa
              : `${benchmarkDeltaPct >= 0 ? "+" : ""}${benchmarkDeltaPct.toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-text-muted">
            {labels.benchmarkDeltaVsBenchmark}
          </dt>
          <dd
            className={`mt-1 font-mono text-sm font-semibold ${pctToneClass(indexDelta)}`}
          >
            {formatSignedDelta(indexDelta)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
