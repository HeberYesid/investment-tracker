import type { ReactNode } from "react";

import type { MonthlySummaryResult } from "@/lib/dashboard/monthly-summary-types";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

const { monthly: labels, metricUnavailable } = getDashboardLabels();
const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
const usdOptions = {
  style: "currency", currency: "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2,
} as const;
const usd = new Intl.NumberFormat("es-CO", usdOptions);
const signedUsd = new Intl.NumberFormat("es-CO", { ...usdOptions, signDisplay: "exceptZero" });

function CivilDate({ value }: { value: string }) {
  return <time dateTime={value}>{dateFormatter.format(new Date(`${value}T00:00:00Z`))}</time>;
}

function Amount({ label, value, reason, signed = false }: {
  label: ReactNode; value: string | null; reason?: string; signed?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1">
        <span className="text-lg font-semibold wrap-anywhere tabular-nums text-text-primary">
          {value === null ? metricUnavailable : (signed ? signedUsd : usd).format(value as `${number}`)}
        </span>
        {reason && <span className="mt-1 block text-sm text-text-secondary">{reason}</span>}
      </dd>
    </div>
  );
}

export function MonthlySummaryCard({ result }: { result: MonthlySummaryResult }) {
  if (result.kind === "absent") return null;
  if (result.kind === "history-unverified") {
    return <p className="rounded-2xl bg-surface-muted p-4 text-sm text-text-secondary">{labels.historyUnverified}</p>;
  }

  const { summary } = result;
  const incomplete = summary.activityReason === "INCOMPLETE_TRADES";
  const openingReason = summary.openingReason && !incomplete ? labels.reasons[summary.openingReason] : undefined;
  const closingReason = summary.closingReason && !incomplete ? labels.reasons[summary.closingReason] : undefined;

  return (
    <section data-testid="monthly-summary" className="min-w-0 space-y-4 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight text-text-primary">{labels.title}</h2>
      <dl className="text-sm text-text-secondary">
        <dt className="font-medium">{labels.period}</dt>
        <dd><CivilDate value={summary.startDate} /> – <CivilDate value={summary.endDate} /></dd>
      </dl>
      {incomplete && <p className="text-sm text-text-secondary">{labels.reasons.INCOMPLETE_TRADES}</p>}
      <dl className="grid gap-4 rounded-xl bg-surface-muted p-3 sm:grid-cols-3 sm:p-4">
        <Amount
          label={<>{labels.openingValue}<span className="block text-xs font-normal">{labels.atClose} <CivilDate value={summary.openingCutoffDate} /></span></>}
          value={summary.openingValueUsd}
          reason={openingReason}
        />
        <Amount
          label={<>{labels.closingValue}<span className="block text-xs font-normal">{labels.atClose} <CivilDate value={summary.endDate} /></span></>}
          value={summary.closingValueUsd}
          reason={closingReason}
        />
        <Amount label={labels.change} value={summary.changeUsd} signed />
      </dl>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{labels.activity}</h3>
        {summary.activity ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
            {Object.entries(labels.tradeTypes).map(([type, label]) => (
              <div key={type} className="min-w-0">
                <dt className="text-text-secondary">{label}</dt>
                <dd className="font-semibold tabular-nums text-text-primary">{summary.activity?.[type as keyof typeof labels.tradeTypes]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{metricUnavailable}</span>
            {summary.activityReason && !incomplete && <span className="block">{labels.reasons[summary.activityReason]}</span>}
          </p>
        )}
      </div>
      <p className="border-t border-border-subtle pt-3 text-xs text-text-secondary">{labels.sourceNote}</p>
    </section>
  );
}
