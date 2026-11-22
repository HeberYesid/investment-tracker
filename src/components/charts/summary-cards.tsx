import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { SummaryResponse } from "@/lib/validations/dashboard";
import { formatNextAttemptEs, formatRelativeEs } from "@/lib/i18n/dates";
import { formatCurrentUsd } from "./current-money";
import { LedgerNotice } from "./ledger-notice";

const labels = getDashboardLabels();

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
  const { sync } = summary;
  const available = summary.ledgerStatus === "complete";
  const showStale = available && (summary.shouldShowStaleBanner ?? (summary.isAnyStale && !summary.isEstimated));
  const noOpenCost = summary.investedUsd === "0";
  const reason = sync ? labels.staleReasons[sync.lastFailureReason] : "";
  const nextAttempt = reason && sync?.nextRunEstimate ? formatNextAttemptEs(sync.nextRunEstimate) : null;
  return (
    <section
      aria-label="Resumen del portafolio"
      className="space-y-3"
      data-testid="summary-cards"
    >
      {!available && <LedgerNotice issues={summary.ledgerIssues} />}
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

      {showStale && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border-l-4 border-orange-500 bg-orange-50 p-4 text-sm text-orange-950 ring-1 ring-orange-200 dark:border-l-orange-400 dark:bg-orange-950/40 dark:text-orange-100 dark:ring-orange-800"
          data-testid="summary-stale-banner"
        >
          <div>
            <p className="font-semibold">{labels.staleBanner}</p>
            <p className="mt-1 text-xs text-orange-900 dark:text-orange-300/80">
              {summary.staleTickers.length > 0
                ? labels.staleBannerDetail.replace(
                    "{tickers}",
                    summary.staleTickers.join(", "),
                  )
                : labels.staleBannerDescription}
            </p>
            {sync?.lastSuccessAt && <p>{labels.staleLastSync.replace("{time}", formatRelativeEs(sync.lastSuccessAt))}</p>}
            {reason && <p>{reason}</p>}
            {nextAttempt && (
              <p>{labels.staleNextSync.replace("{time}", nextAttempt)}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiEquity}
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {formatCurrentUsd(summary.equityUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiInvested}
          </p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {formatCurrentUsd(summary.investedUsd)}
          </p>
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiPnl}
          </p>
          <p className={`mt-2 text-2xl font-bold ${pnlToneClass(Number(summary.totalPnlUsd))}`}>
            {formatCurrentUsd(summary.totalPnlUsd)}
          </p>
          {summary.hasActiveTrades && summary.holdingsCount === 0 && (
            <p className="mt-1 text-xs text-text-secondary">{labels.returnsRealized}: {formatCurrentUsd(summary.realizedPnlUsd)}</p>
          )}
        </article>
        <article className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {labels.kpiReturn}
          </p>
          <p className={`mt-2 text-2xl font-bold ${pnlToneClass(summary.returnPct ?? 0)}`}>
            {summary.returnPct === null ? labels.metricUnavailable : noOpenCost ? labels.noValue : pctFormatter.format(summary.returnPct / 100)}
          </p>
          {available && <p className="mt-1 text-xs text-text-secondary">{noOpenCost ? labels.noOpenCost : labels.simpleReturnHint}</p>}
        </article>
      </div>
    </section>
  );
}
