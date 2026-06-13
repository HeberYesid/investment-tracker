"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { DrawdownResponse } from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const dateFormatter = new Intl.DateTimeFormat("es", {
  month: "short",
  year: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const pctFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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

interface DrawdownChartProps {
  data: DrawdownResponse;
}

export function DrawdownChart({ data }: DrawdownChartProps) {
  if (data.series.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.drawdownTitle}
        </h2>
        <p className="mt-3 text-sm text-slate-500">{labels.drawdownEmpty}</p>
      </section>
    );
  }

  const maxPctAbs = Math.abs(data.maxDrawdownPct);
  const headline = `${labels.drawdownMaxPrefix} ${
    data.maxDrawdownPct < 0 ? "-" : ""
  }${pctFormatter.format(maxPctAbs / 100)}`;

  const chartData = data.series
    .filter((p) => typeof p.date === "string" && p.date.length > 0)
    .map((p) => ({ ...p, parsedDate: new Date(p.date).getTime() }))
    .filter((p) => Number.isFinite(p.parsedDate));

  if (chartData.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.drawdownTitle}
        </h2>
        <p className="mt-3 text-sm text-slate-500">{labels.drawdownEmpty}</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="drawdown-chart"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.drawdownTitle}
        </h2>
        <p
          className={`text-sm font-semibold ${
            data.maxDrawdownPct < 0 ? "text-red-600" : "text-slate-700"
          }`}
        >
          {headline}
        </p>
      </div>

      <div className="mt-4 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={safeFormatShortDate}
              stroke="#cbd5e1"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickFormatter={(value: number) => `${value}%`}
              stroke="#cbd5e1"
              width={50}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <Tooltip
              formatter={(value) => `${Number(value)}%`}
              labelFormatter={safeFormatLongDate}
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="drawdownPct"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#drawdownFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
