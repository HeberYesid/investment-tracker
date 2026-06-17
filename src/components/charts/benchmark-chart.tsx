"use client";

import { useEffect, useState } from "react";
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
import type {
  BenchmarkSeries,
  EvolutionResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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

function buildChartRows(
  evolution: EvolutionResponse,
  benchmark: BenchmarkSeries,
): ChartRow[] {
  const portfolioByDate = new Map<string, number>();
  for (const p of evolution.points) {
    portfolioByDate.set(p.date, p.valueUsd);
  }
  const benchmarkByDate = new Map<string, number>();
  for (const p of benchmark.points) {
    benchmarkByDate.set(p.date, p.value);
  }
  const allDates = new Set<string>([
    ...portfolioByDate.keys(),
    ...benchmarkByDate.keys(),
  ]);
  const rows: ChartRow[] = Array.from(allDates).map((date) => ({
    date,
    parsedDate: new Date(date).getTime(),
    portfolio: portfolioByDate.get(date) ?? null,
    benchmark: benchmarkByDate.get(date) ?? null,
  }));
  rows.sort((a, b) => a.parsedDate - b.parsedDate);
  return rows;
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
}

function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-slate-700">
        {safeFormatLongDate(label)}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry, idx) => {
          const dataKey = entry.dataKey;
          const value = typeof entry.value === "number" ? entry.value : null;
          if (value === null) return null;
          const formatted =
            dataKey === "benchmark"
              ? indexFormatter.format(value)
              : usdFormatter.format(value);
          return (
            <li
              key={idx}
              className="flex items-center gap-2 font-mono text-slate-700"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: entry.color ?? "#0f172a" }}
              />
              <span className="text-slate-600">{entry.name}</span>
              <span className="ml-auto font-semibold text-slate-950">
                {formatted}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BenchmarkChart({ evolution, benchmark }: BenchmarkChartProps) {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const rows = buildChartRows(evolution, benchmark);
  if (rows.length < 2 || !hasMounted) {
    return (
      <section
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
        data-testid="benchmark-chart"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {labels.benchmarkTitle}
            </h2>
            <p className="mt-3 text-sm text-slate-500">{labels.benchmarkEmpty}</p>
          </div>
          {!IS_PRODUCTION && <SyncNowButton />}
        </div>
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

  return (
    <section
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="benchmark-chart"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {labels.benchmarkTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {labels.benchmarkSubtitle.replace("{benchmark}", benchmark.label)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {benchmark.isStale && (
            <span
              className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"
              title={labels.benchmarkStaleTooltip}
            >
              {labels.benchmarkStaleBadge}
            </span>
          )}
          {!IS_PRODUCTION && <SyncNowButton />}
        </div>
      </div>

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={safeFormatShortDate}
              stroke="#cbd5e1"
            />
            <YAxis
              yAxisId="portfolio"
              orientation="left"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(value: number) => usdFormatter.format(value)}
              stroke="#cbd5e1"
              width={70}
            />
            <YAxis
              yAxisId="benchmark"
              orientation="right"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(value: number) => indexFormatter.format(value)}
              stroke="#cbd5e1"
              width={50}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="plainline"
            />
            <Line
              yAxisId="portfolio"
              type="monotone"
              dataKey="portfolio"
              name={labels.benchmarkPortfolioLegend}
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="benchmark"
              type="monotone"
              dataKey="benchmark"
              name={benchmark.label}
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-slate-500">
            {labels.benchmarkPortfolioReturn}
          </dt>
          <dd
            className={`mt-1 font-mono text-sm ${
              portfolioDeltaPct === null
                ? "text-slate-500"
                : portfolioDeltaPct >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
            }`}
          >
            {portfolioDeltaPct === null
              ? "—"
              : `${portfolioDeltaPct >= 0 ? "+" : ""}${portfolioDeltaPct.toFixed(2)}%`}
          </dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wide text-slate-500">
            {benchmark.label}
          </dt>
          <dd
            className={`mt-1 font-mono text-sm ${
              benchmarkDeltaPct === null
                ? "text-slate-500"
                : benchmarkDeltaPct >= 0
                  ? "text-emerald-600"
                  : "text-red-600"
            }`}
          >
            {benchmarkDeltaPct === null
              ? "—"
              : `${benchmarkDeltaPct >= 0 ? "+" : ""}${benchmarkDeltaPct.toFixed(2)}%`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

type SyncStatus = "idle" | "loading" | "success" | "error";

function SyncNowButton() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/v1/admin/sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "PRICES" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const errorMessage =
          typeof body?.error === "string"
            ? body.error
            : body?.error?.message ?? labels.benchmarkSyncError;
        throw new Error(errorMessage);
      }
      setStatus("success");
      setMessage(labels.benchmarkSyncSuccess);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : labels.benchmarkSyncError);
    }
  }

  const tone =
    status === "success"
      ? "text-emerald-600"
      : status === "error"
        ? "text-red-600"
        : "text-slate-500";
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={status === "loading"}
        className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
        data-testid="benchmark-sync-now"
      >
        {status === "loading" ? labels.benchmarkSyncRunning : labels.benchmarkSyncNow}
      </button>
      {message && (
        <p className={`text-xs ${tone}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
