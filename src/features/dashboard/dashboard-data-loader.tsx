import { redirect } from "next/navigation";

import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { getCurrentPortfolio } from "@/lib/supabase/auth";

import { DashboardPageClient } from "./dashboard-page-client";

export async function DashboardDataLoader() {
  const portfolio = await getCurrentPortfolio();
  if (!portfolio) {
    redirect("/login");
  }

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
