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
    case "month":
      return labels.groupMonth;
    case "year":
      return labels.groupYear;
    case "stock":
      return labels.groupStock;
    case "broker":
      return labels.groupBroker;
  }
}

function pnlToneClass(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-slate-700";
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
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      data-testid="returns-table"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          {labels.returnsTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
          {(["month", "year", "stock", "broker"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleGroupChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                groupBy === option
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {groupLabel(option)}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 overflow-x-auto ${loading ? "opacity-50" : ""}`}>
        {data.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {labels.returnsEmpty}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="pb-2">{labels.returnsLabel}</th>
                <th className="pb-2 text-right">{labels.returnsRealized}</th>
                <th className="pb-2 text-right">{labels.returnsUnrealized}</th>
                <th className="pb-2 text-right">{labels.returnsTotal}</th>
                <th className="pb-2 text-right">{labels.returnsPct}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-950">{row.label}</td>
                  <td className={`py-2 text-right font-mono ${pnlToneClass(row.realizedPnlUsd)}`}>
                    {usdFormatter.format(row.realizedPnlUsd)}
                  </td>
                  <td className={`py-2 text-right font-mono ${pnlToneClass(row.unrealizedPnlUsd)}`}>
                    {usdFormatter.format(row.unrealizedPnlUsd)}
                  </td>
                  <td className={`py-2 text-right font-mono font-semibold ${pnlToneClass(row.totalPnlUsd)}`}>
                    {usdFormatter.format(row.totalPnlUsd)}
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
