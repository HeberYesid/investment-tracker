"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { getChartPalette } from "@/lib/theme/chart-palette";
import { useTheme } from "@/lib/theme/theme-provider";
import { useChartExport } from "@/lib/chart-export";
import { ChartExportButton } from "@/components/ui/chart-export-button";
import type {
  AssetStaleness,
  DistributionDimension,
  DistributionResponse,
} from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
  const [dim, setDim] = useState<DistributionDimension>(initial.dim);
  const [data, setData] = useState<DistributionResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

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

  async function handleEnrich() {
    if (enriching) return;
    setEnriching(true);
    setEnrichMessage(null);
    try {
      let totalSucceeded = 0;
      let totalNotFound = 0;
      let totalFailed = 0;
      let nextOffset: number | null = 0;
      let firstForbidden = false;
      while (nextOffset !== null) {
        const res = await fetch("/api/v1/admin/backfill-asset-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10, offset: nextOffset ?? 0 }),
        });
        if (res.status === 403) {
          firstForbidden = true;
          break;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } | string }
            | null;
          const message =
            (typeof body?.error === "object" && body?.error?.message) ||
            (typeof body?.error === "string" ? body.error : null) ||
            "Error al enriquecer";
          setEnrichMessage(message);
          return;
        }
        const body = (await res.json()) as {
          succeeded: number;
          notFound: number;
          failed: number;
          nextOffset: number | null;
        };
        totalSucceeded += body.succeeded;
        totalNotFound += body.notFound;
        totalFailed += body.failed;
        nextOffset = body.nextOffset;
      }
      if (firstForbidden) {
        setEnrichMessage(labels.distributionEnrichForbidden);
        return;
      }
      const totalMissed = totalNotFound + totalFailed;
      if (totalSucceeded > 0 && totalMissed > 0) {
        setEnrichMessage(
          labels.distributionEnrichPartial
            .replace("{succeeded}", String(totalSucceeded))
            .replace("{failed}", String(totalMissed)),
        );
      } else if (totalSucceeded > 0) {
        setEnrichMessage(
          labels.distributionEnrichDone.replace(
            "{succeeded}",
            String(totalSucceeded),
          ),
        );
      } else if (totalNotFound > 0) {
        setEnrichMessage(
          labels.distributionEnrichAllNotFound.replace(
            "{total}",
            String(totalNotFound),
          ),
        );
      } else if (totalFailed > 0) {
        setEnrichMessage(
          labels.distributionEnrichPartial
            .replace("{succeeded}", "0")
            .replace("{failed}", String(totalFailed)),
        );
      } else {
        setEnrichMessage(
          labels.distributionEnrichDone.replace("{succeeded}", "0"),
        );
      }
      const res = await fetch(`/api/v1/dashboard/distribution?dim=${dim}`);
      if (res.ok) {
        const json = (await res.json()) as DistributionResponse;
        setData(json);
      }
    } catch (err) {
      setEnrichMessage(err instanceof Error ? err.message : labels.errorLoading);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle"
      data-testid="distribution-chart"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {labels.distributionTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-surface-muted p-1 text-xs">
          {(["broker", "sector", "country"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleDimChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                dim === option
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

      {data.unclassified && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p
            className="text-xs text-text-muted"
            title={labels.distributionUnclassifiedTooltip}
          >
            ⓘ {labels.distributionUnclassifiedTooltip}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleEnrich}
            disabled={enriching}
            data-testid="distribution-enrich-button"
          >
            {enriching
              ? labels.distributionEnrichRunning
              : labels.distributionEnrichButton}
          </Button>
        </div>
      )}

      {enrichMessage && (
        <p
          className="mt-2 text-xs text-text-secondary"
          data-testid="distribution-enrich-message"
        >
          {enrichMessage}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="h-56" ref={containerRef}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(value, name) => [
                  usdFormatter.format(Number(value)),
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
