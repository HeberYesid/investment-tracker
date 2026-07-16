import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { loadDashboardAggregate, type DashboardAggregate } from "@/lib/dashboard/aggregate";

export const DEMO_PORTFOLIO_ID = "20000000-0000-0000-0000-000000000001";

export async function loadDemoDashboardAggregate(): Promise<DashboardAggregate> {
  const supabase = createServiceSupabaseClient();
  return loadDashboardAggregate(DEMO_PORTFOLIO_ID, supabase, "full", {
    evolutionGranularity: "monthly",
    returnsGroupBy: "stock",
    distributionDimension: "broker",
  });
}
