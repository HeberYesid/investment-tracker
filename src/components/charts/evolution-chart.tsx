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
import { getChartPalette } from "@/lib/theme/chart-palette";
import { useTheme } from "@/lib/theme/theme-provider";
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
  isEstimated?: boolean;
}

export function EvolutionChart({
  data,
  isEstimated = true,
}: EvolutionChartProps) {
  const { resolvedTheme } = useTheme();
  const palette = getChartPalette(resolvedTheme);
  const gradientId = `equityFill-${resolvedTheme}`;
  const sectionClass =
    "rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-6";
  const titleClass = "text-lg font-semibold text-text-primary";
  const emptyTextClass = "mt-3 text-sm text-text-muted";

  if (data.points.length === 0) {
    return (
      <section className={sectionClass} style={{ padding: "1.5rem" }}>
        <h2 className={titleClass}>{labels.evolutionTitle}</h2>
        <p className={emptyTextClass}>{labels.evolutionEmpty}</p>
      </section>
    );
  }

  const chartData = data.points
    .filter((p) => typeof p.date === "string" && p.date.length > 0)
    .map((p) => ({ ...p, parsedDate: new Date(p.date).getTime() }))
    .filter((p) => Number.isFinite(p.parsedDate));

  if (chartData.length === 0) {
    return (
      <section className={sectionClass} style={{ padding: "1.5rem" }}>
        <h2 className={titleClass}>{labels.evolutionTitle}</h2>
        <p className={emptyTextClass}>{labels.evolutionEmpty}</p>
      </section>
    );
  }

  return (
    <section
      className={sectionClass}
      data-testid="evolution-chart"
    >
      <h2 className={titleClass}>{labels.evolutionTitle}</h2>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.primaryFillFrom} stopOpacity={0.4} />
                <stop offset="100%" stopColor={palette.primaryFillTo} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: palette.axis }}
              tickFormatter={safeFormatShortDate}
              stroke={palette.grid}
            />
            <YAxis
              tick={{ fontSize: 11, fill: palette.axis }}
              tickFormatter={(value: number) => usdFormatter.format(value)}
              stroke={palette.grid}
              width={70}
            />
            <Tooltip
              formatter={(value) => usdFormatter.format(Number(value))}
              labelFormatter={safeFormatLongDate}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                border: `1px solid ${palette.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="valueUsd"
              stroke={palette.primary}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {isEstimated ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {labels.evolutionFootnote}
        </p>
      ) : (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {labels.evolutionFootnoteHistorical}
        </p>
      )}
    </section>
  );
}
