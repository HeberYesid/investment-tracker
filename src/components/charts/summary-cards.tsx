"use client";

import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { SummaryResponse } from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

const usdFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const pctFormatter = new Intl.NumberFormat("es-CO", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface SummaryCardsProps {
  summary: SummaryResponse;
}

function pnlToneClass(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-slate-950";
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <section
      aria-label="Resumen del portafolio"
      className="space-y-3"
      data-testid="summary-cards"
    >
      {summary.isEstimated && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <div>
            <p className="font-semibold">{labels.estimatedBanner}</p>
            <p className="mt-1 text-xs text-amber-800">
              {labels.estimatedBannerDescription}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.kpiEquity}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {usdFormatter.format(summary.equityUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.kpiInvested}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {usdFormatter.format(summary.investedUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.kpiPnl}
          </p>
          <p className={`mt-2 text-2xl font-bold ${pnlToneClass(summary.totalPnlUsd)}`}>
            {usdFormatter.format(summary.totalPnlUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.kpiReturn}
          </p>
          <p className={`mt-2 text-2xl font-bold ${pnlToneClass(summary.returnPct)}`}>
            {pctFormatter.format(summary.returnPct / 100)}
          </p>
        </article>
      </div>
    </section>
  );
}
