"use client";

import { useState } from "react";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { ReturnsGroupBy, ReturnsResponse } from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pctFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function groupLabel(group: ReturnsGroupBy): string {
  switch (group) {
    case "year":
      return labels.groupYear;
    case "stock":
      return labels.groupStock;
    case "broker":
      return labels.groupBroker;
  }
}

function pnlToneClass(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-text-secondary";
}

interface ReturnsTableProps {
  initial: ReturnsResponse;
}

export function ReturnsTable({ initial }: ReturnsTableProps) {
  const [groupBy, setGroupBy] = useState<ReturnsGroupBy>(initial.groupBy);
  const [data, setData] = useState<ReturnsResponse>(initial);
  const [loading, setLoading] = useState(false);

  async function handleGroupChange(next: ReturnsGroupBy) {
    if (next === groupBy) return;
    setGroupBy(next);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard/returns?groupBy=${next}`);
      if (!res.ok) throw new Error("error");
      const json = (await res.json()) as ReturnsResponse;
      setData(json);
    } catch {
      // Keep previous data on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle"
      data-testid="returns-table"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">
          {labels.returnsTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-surface-muted p-1 text-xs">
          {(["year", "stock", "broker"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleGroupChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                groupBy === option
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {groupLabel(option)}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 overflow-x-auto ${loading ? "opacity-50" : ""}`}>
        {data.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            {labels.returnsEmpty}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                <th className="pb-2">{labels.returnsLabel}</th>
                <th className="pb-2 text-right">{labels.returnsInvested}</th>
                <th className="pb-2 text-right">{labels.returnsActual}</th>
                <th className="pb-2 text-right">{labels.returnsPct}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-border-subtle"
                  title={`${labels.returnsRealized}: ${usdFormatter.format(row.realizedPnlUsd)}\n${labels.returnsUnrealized}: ${usdFormatter.format(row.unrealizedPnlUsd)}`}
                >
                  <td className="py-2 font-medium text-text-primary">{row.label}</td>
                  <td className="py-2 text-right font-mono text-text-secondary">
                    {usdFormatter.format(row.investedUsd)}
                  </td>
                  <td className="py-2 text-right">
                    <span className="font-mono text-text-secondary">
                      {usdFormatter.format(row.actualUsd)}
                    </span>
                  </td>
                  <td className={`py-2 text-right font-mono ${pnlToneClass(row.returnPct)}`}>
                    {pctFormatter.format(row.returnPct / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
