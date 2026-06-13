"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type {
  DistributionDimension,
  DistributionResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const PIE_COLORS = [
  "#0f172a",
  "#1e293b",
  "#334155",
  "#475569",
  "#64748b",
  "#94a3b8",
  "#cbd5e1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
];

const UNCLASSIFIED_COLOR = "#cbd5e1";

interface DistributionChartProps {
  initial: DistributionResponse;
}

function dimLabel(dim: DistributionDimension): string {
  if (dim === "broker") return labels.dimBroker;
  if (dim === "sector") return labels.dimSector;
  return labels.dimCountry;
}

export function DistributionChart({ initial }: DistributionChartProps) {
  const [dim, setDim] = useState<DistributionDimension>(initial.dim);
  const [data, setData] = useState<DistributionResponse>(initial);
  const [loading, setLoading] = useState(false);

  async function handleDimChange(next: DistributionDimension) {
    if (next === dim) return;
    setDim(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard/distribution?dim=${next}`);
      if (!res.ok) throw new Error("error");
      const json = (await res.json()) as DistributionResponse;
      setData(json);
    } catch {
      // Keep previous data on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="distribution-chart"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.distributionTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
          {(["broker", "sector", "country"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleDimChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                dim === option
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {dimLabel(option)}
            </button>
          ))}
        </div>
      </div>

      {data.unclassified && (
        <p
          className="mt-2 text-xs text-slate-500"
          title={labels.distributionUnclassifiedTooltip}
        >
          ⓘ {labels.distributionUnclassifiedTooltip}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(value, name) => [
                  usdFormatter.format(Number(value)),
                  String(name),
                ]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Pie
                data={data.slices}
                dataKey="valueUsd"
                nameKey="label"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
                isAnimationActive={false}
              >
                {data.slices.map((slice, index) => (
                  <Cell
                    key={slice.key}
                    fill={
                      slice.key === "__unclassified__"
                        ? UNCLASSIFIED_COLOR
                        : PIE_COLORS[index % PIE_COLORS.length]
                    }
                    strokeDasharray={slice.key === "__unclassified__" ? "4 2" : "0"}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className={`space-y-2 ${loading ? "opacity-50" : ""}`}>
          {data.slices.length === 0 && (
            <li className="text-sm text-slate-500">{labels.distributionEmpty}</li>
          )}
          {data.slices.map((slice, index) => (
            <li
              key={slice.key}
              className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor:
                      slice.key === "__unclassified__"
                        ? UNCLASSIFIED_COLOR
                        : PIE_COLORS[index % PIE_COLORS.length],
                  }}
                />
                <span className="truncate font-medium text-slate-950">
                  {slice.label}
                </span>
                <span className="text-xs text-slate-500">
                  ({slice.holdingsCount})
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right">
                <span className="font-mono text-xs text-slate-700">
                  {slice.percent.toFixed(2)}%
                </span>
                <span className="font-mono text-xs text-slate-500">
                  {usdFormatter.format(slice.valueUsd)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
