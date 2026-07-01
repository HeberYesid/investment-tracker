"use client";

import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

import { DashboardView, type DashboardViewPayload } from "./dashboard-view";
import { useDashboardData } from "./use-dashboard-data";

const labels = getDashboardLabels();

export function DashboardPageClient({
  initialPayload,
}: {
  initialPayload: DashboardViewPayload;
}) {
  const { loading, error, payload, reload } = useDashboardData(initialPayload);

  if (error) {
    return (
      <section
        className="space-y-3 rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-red-200 dark:ring-red-800"
        data-testid="dashboard-error"
        role="alert"
      >
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          {labels.retry}
        </Button>
      </section>
    );
  }

  return (
    <>
      {loading && (
        <section
          className="rounded-2xl bg-surface p-4 text-center text-sm text-text-muted shadow-sm ring-1 ring-border-subtle"
          data-testid="dashboard-reloading"
          aria-live="polite"
        >
          {labels.loadingDashboard}
        </section>
      )}
      <DashboardView payload={payload} />
    </>
  );
}
