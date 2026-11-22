"use client";

import { useId, useState } from "react";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { ReturnsResponse, type ReturnsGroupBy } from "@/lib/validations/dashboard";
import { formatCurrentUsd } from "./current-money";
import { LedgerNotice } from "./ledger-notice";

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
  const headingId = useId();
  const [data, setData] = useState<ReturnsResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const annual = data.groupBy === "year";
  const unavailable = !annual && data.ledgerStatus === "unavailable";

  async function handleGroupChange(next: ReturnsGroupBy) {
    if (loading || next === data.groupBy) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/dashboard/returns?groupBy=${next}`);
      if (!res.ok) throw new Error("error");
      const json = ReturnsResponse.parse(await res.json());
      if (json.groupBy !== next) throw new Error("groupBy");
      setData(json);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="min-w-0 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle"
      data-testid="returns-table"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg font-semibold text-text-primary">
          {labels.returnsTitle}
        </h2>
        <div className="flex gap-1 rounded-full bg-surface-muted p-1 text-xs">
          {(["year", "stock", "broker"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={data.groupBy === option}
              disabled={loading}
              onClick={() => handleGroupChange(option)}
              className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                data.groupBy === option
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {groupLabel(option)}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-2 text-xs text-text-muted">{annual ? labels.groupYearHint : labels.simpleReturnHint}</p>
      {failed && <p role="alert" className="mt-2 text-sm text-text-secondary">{labels.returnsLoadError}</p>}
      {unavailable && <LedgerNotice issues={data.ledgerIssues} partial={data.rows.some((row) => row.ledgerStatus === "complete")} />}

      <div role="region" aria-labelledby={headingId} tabIndex={data.rows.length ? 0 : undefined} aria-busy={loading}
        className={`mt-4 max-w-full overflow-x-auto ${loading ? "opacity-50" : ""}`}>
        {data.rows.length === 0 ? (
          unavailable ? null : <p className="py-6 text-center text-sm text-text-muted">
            {labels.returnsEmpty}
          </p>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                <th scope="col" className="pb-2">{labels.returnsLabel}</th>
                {(annual ? [labels.returnsInvested, labels.returnsActual] : [labels.returnsCost, labels.returnsPositionValue,
                  labels.returnsRealized, labels.returnsUnrealized, labels.returnsTotal]).map((label) =>
                  <th key={label} scope="col" className="px-2 pb-2 text-right whitespace-nowrap">{label}</th>)}
                <th scope="col" className="px-2 pb-2 text-right whitespace-nowrap">{labels.returnsPct}</th>
              </tr>
            </thead>
            <tbody>
              {annual ? data.rows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-border-subtle"
                  title={`${labels.returnsRealized}: ${usdFormatter.format(row.realizedPnlUsd)}\n${labels.returnsUnrealized}: ${usdFormatter.format(row.unrealizedPnlUsd)}`}
                >
                  <th scope="row" className="py-2 text-left font-medium text-text-primary">{row.label}</th>
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
              )) : data.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="sticky start-0 min-w-24 max-w-48 border-b border-border-subtle bg-surface py-2 pe-2 text-left font-medium wrap-anywhere text-text-primary">{row.label}</th>
                  {[row.investedUsd, row.actualUsd, row.realizedPnlUsd, row.unrealizedPnlUsd, row.totalPnlUsd].map((value, index) =>
                    <td key={index} className="border-b border-border-subtle px-2 py-2 text-right font-mono whitespace-nowrap text-text-secondary">{formatCurrentUsd(value)}</td>)}
                  <td className={`border-b border-border-subtle px-2 py-2 text-right font-mono whitespace-nowrap ${pnlToneClass(row.returnPct ?? 0)}`}>
                    {row.returnPct === null ? labels.metricUnavailable : row.investedUsd === "0"
                      ? <>{labels.noValue} <span className="text-xs">{labels.noOpenCost}</span></> : pctFormatter.format(row.returnPct / 100)}
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
