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
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-text-primary";
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
          className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800"
          data-testid="summary-estimated-banner"
        >
          <div>
            <p className="font-semibold">{labels.estimatedBanner}</p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300/80">
              {labels.estimatedBannerDescription}
            </p>
          </div>
        </div>
      )}

      {summary.isAnyStale && !summary.isEstimated && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-sm text-orange-900 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800"
          data-testid="summary-stale-banner"
        >
          <div>
            <p className="font-semibold">{labels.staleBanner}</p>
            <p className="mt-1 text-xs text-orange-800 dark:text-orange-300/80">
              {labels.staleBannerDescription}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiEquity}
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {usdFormatter.format(summary.equityUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiInvested}
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {usdFormatter.format(summary.investedUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiPnl}
          </p>
          <p className={`mt-2 text-2xl font-bold ${pnlToneClass(summary.totalPnlUsd)}`}>
            {usdFormatter.format(summary.totalPnlUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
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
