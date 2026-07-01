"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

import { ReturnsTable } from "@/components/charts/returns-table";
import { BenchmarkReturnsTable } from "@/components/charts/benchmark-returns-table";
import { SummaryCards } from "@/components/charts/summary-cards";
import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

import type { AdvancedPayload } from "./use-advanced-data";
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
      className="h-64 w-full animate-pulse rounded-2xl bg-surface-muted"
      data-testid={testId}
    />
  );
}

const labels = getDashboardLabels();

export function AvanzadoPageClient({
  initialPayload,
}: {
  initialPayload: AdvancedPayload;
}) {
  const { loading, error, payload, reload } = useAdvancedData(initialPayload);
  const [backfillState, setBackfillState] = useState<{
    status: "idle" | "running" | "success" | "error";
    message?: string;
  }>({ status: "idle" });

  async function handleBackfill() {
    setBackfillState({ status: "running" });
    try {
      const res = await fetch("/api/v1/admin/sync/benchmark-backfill", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message =
          typeof body?.error === "string"
            ? body.error
            : labels.benchmarkBackfillError;
        setBackfillState({ status: "error", message });
        return;
      }
      const data = (await res.json()) as { inserted: number; skipped: number };
      const message =
        data.inserted > 0
          ? labels.benchmarkBackfillSuccess.replace("{inserted}", String(data.inserted))
          : labels.benchmarkBackfillNoNew;
      setBackfillState({ status: "success", message });
      await reload();
    } catch {
      setBackfillState({
        status: "error",
        message: labels.benchmarkBackfillError,
      });
    }
  }

  if (error) {
    return (
      <section
        className="space-y-3 rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-red-200 dark:ring-red-800"
        data-testid="avanzado-error"
        role="alert"
      >
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">{error}</p>
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
        className="rounded-[2rem] bg-surface p-8 text-center shadow-sm ring-1 ring-border-subtle sm:p-10"
        data-testid="avanzado-empty"
      >
        <h2 className="text-2xl font-bold tracking-tight text-text-primary">
          {labels.emptyHeading}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">
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

  const hasBenchmark = Boolean(payload.snapshot?.benchmark);
  const showBackfillButton = !hasBenchmark || backfillState.status !== "idle";

  return (
    <>
      {loading && (
        <section
          className="rounded-2xl bg-surface p-4 text-center text-sm text-text-muted shadow-sm ring-1 ring-border-subtle"
          data-testid="avanzado-reloading"
          aria-live="polite"
        >
          {labels.loadingDashboard}
        </section>
      )}
      <div className="space-y-4" data-testid="avanzado-ready">
        {payload.summary && <SummaryCards summary={payload.summary} />}

        {!hasBenchmark && (
          <section
            className="rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-border-subtle"
            data-testid="benchmark-backfill-prompt"
          >
            <p className="text-sm text-text-secondary">
              {labels.benchmarkNoBenchmark}
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => void handleBackfill()}
              disabled={backfillState.status === "running"}
              data-testid="benchmark-backfill-button"
            >
              {backfillState.status === "running"
                ? labels.benchmarkBackfillRunning
                : labels.benchmarkBackfillButton}
            </Button>
            {backfillState.status === "success" && (
              <p
                className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                data-testid="benchmark-backfill-success"
              >
                {backfillState.message}
              </p>
            )}
            {backfillState.status === "error" && (
              <p
                className="mt-3 text-sm font-medium text-red-600 dark:text-red-400"
                data-testid="benchmark-backfill-error"
              >
                {backfillState.message}
              </p>
            )}
          </section>
        )}

        {hasBenchmark && showBackfillButton && backfillState.status !== "idle" && (
          <section
            className="rounded-2xl bg-surface p-4 text-center shadow-sm ring-1 ring-border-subtle"
            data-testid="benchmark-backfill-status"
          >
            {backfillState.status === "success" && (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {backfillState.message}
              </p>
            )}
            {backfillState.status === "error" && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {backfillState.message}
              </p>
            )}
          </section>
        )}

        {payload.evolution && payload.snapshot?.benchmark && (
          <BenchmarkChart
            evolution={payload.evolution}
            benchmark={payload.snapshot.benchmark}
          />
        )}
        {payload.evolution && payload.snapshot?.benchmark && (
          <BenchmarkReturnsTable
            evolution={payload.evolution}
            benchmark={payload.snapshot.benchmark}
          />
        )}
        {payload.distribution && <DistributionChart initial={payload.distribution} />}
        {payload.returns && <ReturnsTable initial={payload.returns} />}
      </div>
    </>
  );
}
