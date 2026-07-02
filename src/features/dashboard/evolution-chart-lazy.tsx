"use client";

import dynamic from "next/dynamic";

import type { EvolutionResponse } from "@/lib/validations/dashboard";

const EvolutionChart = dynamic(
  () => import("@/components/charts/evolution-chart").then((m) => m.EvolutionChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-64 w-full animate-pulse rounded-2xl bg-surface-muted"
        data-testid="evolution-chart-skeleton"
      />
    ),
  },
);

type EvolutionChartLazyProps = {
  data: EvolutionResponse;
  isEstimated?: boolean;
};

export function EvolutionChartLazy({
  data,
  isEstimated = true,
}: EvolutionChartLazyProps) {
  return <EvolutionChart data={data} isEstimated={isEstimated} />;
}
