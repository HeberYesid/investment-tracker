"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { EvolutionResponse } from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
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

interface EvolutionChartProps {
  data: EvolutionResponse;
  isEstimated: boolean;
}

export function EvolutionChart({ data, isEstimated }: EvolutionChartProps) {
  if (data.points.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.evolutionTitle}
        </h2>
        <p className="mt-3 text-sm text-slate-500">{labels.evolutionEmpty}</p>
      </section>
    );
  }

  const chartData = data.points
    .filter((p) => typeof p.date === "string" && p.date.length > 0)
    .map((p) => ({ ...p, parsedDate: new Date(p.date).getTime() }))
    .filter((p) => Number.isFinite(p.parsedDate));

  if (chartData.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.evolutionTitle}
        </h2>
        <p className="mt-3 text-sm text-slate-500">{labels.evolutionEmpty}</p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="evolution-chart"
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {labels.evolutionTitle}
      </h2>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#0f172a" stopOpacity={0.05} />
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
              tickFormatter={(value: number) => usdFormatter.format(value)}
              stroke="#cbd5e1"
              width={70}
            />
            <Tooltip
              formatter={(value: number) => usdFormatter.format(value)}
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
              dataKey="valueUsd"
              stroke="#0f172a"
              strokeWidth={2}
              fill="url(#equityFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {isEstimated && (
        <p className="mt-3 text-xs text-amber-700">
          {labels.evolutionFootnote}
        </p>
      )}
    </section>
  );
}
