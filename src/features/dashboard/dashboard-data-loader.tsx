import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { loadDemoDashboardAggregate } from "@/lib/dashboard/demo-loader";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getCurrentPortfolio } from "@/lib/supabase/auth";

import { DashboardPageClient } from "./dashboard-page-client";

export async function DashboardDataLoader() {
  const portfolio = await getCurrentPortfolio();

  if (portfolio) {
    const supabase = await createUserSupabaseClient();
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
