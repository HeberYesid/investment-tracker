import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type { LedgerIssue } from "@/lib/validations/dashboard";

const labels = getDashboardLabels();

export function LedgerNotice({ issues, partial = false }: { issues: LedgerIssue[]; partial?: boolean }) {
  return <div role="status" className="my-2 rounded-xl border border-border-subtle bg-surface-soft p-3 text-sm text-text-secondary">
    <p className="font-semibold text-text-primary">{labels.ledgerUnavailable}</p>
    {issues.length > 0 && <ul className="mt-1 list-disc ps-5">
      {issues.map(({ code, tradeDate }) => <li key={`${code}:${tradeDate}`}>{tradeDate ? `${tradeDate}: ` : ""}{labels.ledgerIssues[code]}</li>)}
    </ul>}
    {partial && <p className="mt-1">{labels.ledgerPartial}</p>}
  </div>;
}
