"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { getChartPalette } from "@/lib/theme/chart-palette";
import { useTheme } from "@/lib/theme/theme-provider";
import { useChartExport } from "@/lib/chart-export";
import { ChartExportButton } from "@/components/ui/chart-export-button";
import {
  type AssetStaleness,
  type DistributionDimension,
  DistributionResponse,
} from "@/lib/validations/dashboard";
const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const labels = getDashboardLabels();

interface DistributionChartProps {
  initial: DistributionResponse;
}

function dimLabel(dim: DistributionDimension): string {
  if (dim === "broker") return labels.dimBroker;
  if (dim === "sector") return labels.dimSector;
  return labels.dimCountry;
}

function stalenessGlyph(staleness: AssetStaleness): string {
  if (staleness === "estimated") return "≈";
  if (staleness === "stale") return "⏱";
  return "";
}

function stalenessColor(staleness: AssetStaleness): string {
  if (staleness === "estimated") return "text-amber-600 dark:text-amber-400";
  if (staleness === "stale") return "text-orange-600 dark:text-orange-400";
  return "text-text-muted";
}

function stalenessTooltip(staleness: AssetStaleness): string {
  if (staleness === "estimated") return labels.distributionEstimatedTooltip;
  if (staleness === "stale") return labels.distributionStaleTooltip;
  return "";
}

export function DistributionChart({ initial }: DistributionChartProps) {
  const { resolvedTheme } = useTheme();
  const palette = getChartPalette(resolvedTheme);
  const { containerRef, exporting, exportAsPng } = useChartExport("distribucion");
  const [data, setData] = useState<DistributionResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDimChange(next: DistributionDimension) {
    if (next === data.dim || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/dashboard/distribution?dim=${next}`);
      if (!res.ok) throw new Error("error");
      const json = DistributionResponse.parse(await res.json());
      if (json.dim !== next) throw new Error("dim");
      setData(json);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle"
      data-testid="distribution-chart"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {labels.distributionTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-surface-muted p-1 text-xs">
          {(["broker", "sector", "country"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={data.dim === option}
              disabled={loading}
              onClick={() => handleDimChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                data.dim === option
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {dimLabel(option)}
            </button>
          ))}
        </div>
        <ChartExportButton
          exporting={exporting}
          onExport={exportAsPng}
        />
      </div>
      {failed && <p role="alert" className="mt-2 text-sm text-text-secondary">{labels.distributionLoadError}</p>}

      {data.unclassified && (
        <p className="mt-2 text-xs text-text-muted" role="status">{labels.distributionUnclassifiedTooltip}</p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]" aria-busy={loading}>
        <div className="h-56" ref={containerRef}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(_value, name, item) => [
                  usdFormatter.format(Number(item.payload?.valueUsd ?? 0)),
                  String(name),
                ]}
                contentStyle={{
                  backgroundColor: palette.tooltipBg,
                  border: `1px solid ${palette.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 12,
                  color: palette.text,
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
                        ? palette.pieUnclassified
                        : palette.pieSlices[index % palette.pieSlices.length]
                    }
                    strokeDasharray={
                      slice.staleness === "estimated"
                        ? "4 2"
                        : "0"
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className={`space-y-2 ${loading ? "opacity-50" : ""}`}>
          {data.slices.length === 0 && (
            <li className="text-sm text-text-muted">{labels.distributionEmpty}</li>
          )}
          {data.slices.map((slice, index) => (
            <li
              key={slice.key}
              className="flex items-center justify-between gap-3 rounded-xl bg-surface-soft px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor:
                      slice.key === "__unclassified__"
                        ? palette.pieUnclassified
                        : palette.pieSlices[index % palette.pieSlices.length],
                  }}
                />
                <span className="truncate font-medium text-text-primary">
                  {slice.label}
                </span>
                <span className="text-xs text-text-muted">
                  ({slice.holdingsCount})
                </span>
                {slice.staleness !== "fresh" && (
                  <span
                    aria-hidden
                    className={`text-xs font-semibold ${stalenessColor(slice.staleness)}`}
                    title={stalenessTooltip(slice.staleness)}
                  >
                    {stalenessGlyph(slice.staleness)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right">
                <span className="font-mono text-xs text-text-secondary">
                  {slice.percent.toFixed(2)}%
                </span>
                <span className="font-mono text-xs text-text-muted">
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
