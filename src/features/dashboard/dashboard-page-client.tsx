"use client";

import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

import { DashboardView, type DashboardViewPayload } from "./dashboard-view";
import { useDashboardData } from "./use-dashboard-data";
import { useDateFilters } from "./use-date-filters";

const labels = getDashboardLabels();

function DateFilterBar({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border-subtle">
      <label className="text-xs font-medium text-text-secondary">
        Desde
        <input
          type="date"
          value={from}
          onChange={(e) => onApply(e.target.value, to)}
          className="ml-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-secondary">
        Hasta
        <input
          type="date"
          value={to}
          onChange={(e) => onApply(from, e.target.value)}
          className="ml-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs text-text-primary"
        />
      </label>
      {(from || to) && (
        <button
          type="button"
          onClick={() => onApply("", "")}
          className="rounded-lg px-2 py-1 text-xs text-text-muted hover:text-text-primary"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

function DemoBanner() {
  return (
    <section
      className="rounded-2xl bg-blue-50 p-4 text-center shadow-sm ring-1 ring-blue-200 dark:bg-blue-950 dark:ring-blue-800"
      data-testid="demo-banner"
    >
      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
        {labels.demoBannerTitle}
      </p>
      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
        {labels.demoBannerDescription}
      </p>
      <Button asChild className="mt-3" size="sm">
        <Link href="/login">{labels.demoBannerCta}</Link>
      </Button>
    </section>
  );
}

function DashboardInner({
  initialPayload,
  isDemo,
}: {
  initialPayload: DashboardViewPayload;
  isDemo?: boolean;
}) {
  const { from, to, setFilters, queryString } = useDateFilters();
  const { loading, error, payload, reload } = useDashboardData(initialPayload, queryString);

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
      {isDemo && <DemoBanner />}
      {loading && (
        <section
          className="rounded-2xl bg-surface p-4 text-center text-sm text-text-muted shadow-sm ring-1 ring-border-subtle"
          data-testid="dashboard-reloading"
          aria-live="polite"
        >
          {labels.loadingDashboard}
        </section>
      )}
      <DateFilterBar from={from} to={to} onApply={setFilters} />
      <div className="mt-4">
        <DashboardView payload={payload} />
      </div>
    </>
  );
}

export function DashboardPageClient({
  initialPayload,
  isDemo = false,
}: {
  initialPayload: DashboardViewPayload;
  isDemo?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <DashboardInner initialPayload={initialPayload} isDemo={isDemo} />
    </Suspense>
  );
}
