import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { loadDemoDashboardAggregate } from "@/lib/dashboard/demo-loader";
import type { PortfolioContext } from "@/lib/supabase/auth";

import { DashboardPageClient } from "./dashboard-page-client";

export async function DashboardDataLoader({ context }: {
  context: Extract<PortfolioContext, { kind: "active" | "anonymous" }>;
}) {

  if (context.kind === "active") {
    const { portfolio, supabase } = context;
    const aggregate = await loadDashboardAggregate(
      portfolio.portfolioId,
      supabase,
      "full",
      {
        evolutionGranularity: "monthly",
        returnsGroupBy: "stock",
        distributionDimension: "broker",
      },
    );

    return (
      <DashboardPageClient
        initialPayload={{
          summary: aggregate.summary ?? null,
          evolution: aggregate.evolution ?? null,
          returns: aggregate.returns ?? null,
          snapshot: aggregate.snapshot ?? null,
        }}
      />
    );
  }

  const aggregate = await loadDemoDashboardAggregate();

  return (
    <DashboardPageClient
      isDemo
      initialPayload={{
        summary: aggregate.summary ?? null,
        evolution: aggregate.evolution ?? null,
        returns: aggregate.returns ?? null,
        snapshot: aggregate.snapshot ?? null,
      }}
    />
  );
}
