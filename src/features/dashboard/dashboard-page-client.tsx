"use client";

import Link from "next/link";

import { BenchmarkChart } from "@/components/charts/benchmark-chart";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { DrawdownChart } from "@/components/charts/drawdown-chart";
import { EvolutionChart } from "@/components/charts/evolution-chart";
import { ReturnsTable } from "@/components/charts/returns-table";
import { SummaryCards } from "@/components/charts/summary-cards";
import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

import { useDashboardData } from "./use-dashboard-data";

const labels = getDashboardLabels();

export function DashboardPageClient() {
  const { loading, error, payload, reload } = useDashboardData();

  if (loading) {
    return (
      <section
        className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200"
        data-testid="dashboard-loading"
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
        data-testid="dashboard-error"
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
        data-testid="dashboard-empty"
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
    <div className="space-y-4" data-testid="dashboard-ready">
      {payload.summary && <SummaryCards summary={payload.summary} />}
      {payload.evolution && (
        <EvolutionChart
          data={payload.evolution}
          isEstimated={payload.summary?.isEstimated ?? false}
        />
      )}
      {payload.distribution && <DistributionChart initial={payload.distribution} />}
      {payload.returns && <ReturnsTable initial={payload.returns} />}
      {payload.drawdown && <DrawdownChart data={payload.drawdown} />}
      {payload.evolution && payload.snapshot?.benchmark && (
        <BenchmarkChart
          evolution={payload.evolution}
          benchmark={payload.snapshot.benchmark}
        />
      )}
    </div>
  );
}
