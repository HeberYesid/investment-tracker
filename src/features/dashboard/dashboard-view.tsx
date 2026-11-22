import Link from "next/link";

import { SummaryCards } from "@/components/charts/summary-cards";
import { Button } from "@/components/ui/button";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import type {
  EvolutionResponse,
  ReturnsResponse,
  SnapshotResponse,
  SummaryResponse,
} from "@/lib/validations/dashboard";

import { EvolutionChartLazy } from "./evolution-chart-lazy";

export type DashboardViewPayload = {
  summary: SummaryResponse | null;
  evolution: EvolutionResponse | null;
  returns: ReturnsResponse | null;
  snapshot: SnapshotResponse | null;
};

const labels = getDashboardLabels();

export function DashboardView({ payload }: { payload: DashboardViewPayload }) {
  const isEmpty =
    payload.summary?.hasActiveTrades === false && payload.summary.ledgerStatus === "complete";

  if (isEmpty) {
    return (
      <section
        className="rounded-[2rem] bg-surface p-8 text-center shadow-sm ring-1 ring-border-subtle sm:p-10"
        data-testid="dashboard-empty"
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

  return (
    <div className="space-y-4" data-testid="dashboard-ready">
      {payload.summary && <SummaryCards summary={payload.summary} />}
      {payload.evolution && (
        <EvolutionChartLazy
          data={payload.evolution}
          isEstimated={payload.evolution.isEstimated ?? true}
        />
      )}
    </div>
  );
}
