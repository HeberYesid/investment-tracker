"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

import { ReturnsTable } from "@/components/charts/returns-table";
import { SummaryCards } from "@/components/charts/summary-cards";
import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

import { useAdvancedData } from "./use-advanced-data";

const BenchmarkChart = dynamic(
  () => import("@/components/charts/benchmark-chart").then((m) => m.BenchmarkChart),
  { ssr: false, loading: () => <ChartSkeleton testId="benchmark-chart-skeleton" /> },
);
const DistributionChart = dynamic(
  () => import("@/components/charts/distribution-chart").then((m) => m.DistributionChart),
  { ssr: false, loading: () => <ChartSkeleton testId="distribution-chart-skeleton" /> },
);

function ChartSkeleton({ testId }: { testId: string }) {
  return (
    <div
      className="h-64 w-full animate-pulse rounded-2xl bg-slate-100"
      data-testid={testId}
    />
  );
}

const labels = getDashboardLabels();

export function AvanzadoPageClient() {
  const { loading, error, payload, reload } = useAdvancedData();

  if (loading) {
    return (
      <section
        className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200"
        data-testid="avanzado-loading"
        aria-live="polite"
      >
        {labels.loadingDashboard}
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="space-y-3 rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-red-200"
        data-testid="avanzado-error"
        role="alert"
      >
        <p className="text-sm font-semibold text-red-700">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void reload()}>
          {labels.retry}
        </Button>
      </section>
    );
  }

  const isEmpty =
    payload.summary !== null && payload.summary.holdingsCount === 0;

  if (isEmpty) {
    return (
      <section
        className="rounded-[2rem] bg-white p-8 text-center shadow-sm ring-1 ring-slate-200 sm:p-10"
        data-testid="avanzado-empty"
      >
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">
          {labels.emptyHeading}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">
          {labels.emptyDescription}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/trades/new">{labels.emptyPrimaryCta}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/import">{labels.emptySecondaryCta}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="avanzado-ready">
      {payload.summary && <SummaryCards summary={payload.summary} />}
      {payload.evolution && payload.snapshot?.benchmark && (
        <BenchmarkChart
          evolution={payload.evolution}
          benchmark={payload.snapshot.benchmark}
        />
      )}
      {payload.distribution && <DistributionChart initial={payload.distribution} />}
      {payload.returns && <ReturnsTable initial={payload.returns} />}
    </div>
  );
}
