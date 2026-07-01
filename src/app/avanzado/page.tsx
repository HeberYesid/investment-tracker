import { redirect } from "next/navigation";

import { MainNavigation } from "@/components/layout/main-navigation";
import { loadDashboardAggregate } from "@/lib/dashboard/aggregate";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { AvanzadoPageClient } from "@/features/avanzado/avanzado-page-client";

const labels = getDashboardLabels();

export default async function AvanzadoPage() {
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
      returnsGroupBy: "month",
      distributionDimension: "broker",
    },
  );

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {labels.pageTitleAdvanced}
          </h1>
        </section>

        <AvanzadoPageClient
          initialPayload={{
            summary: aggregate.summary ?? null,
            distribution: aggregate.distribution ?? null,
            evolution: aggregate.evolution ?? null,
            returns: aggregate.returns ?? null,
            snapshot: aggregate.snapshot ?? null,
          }}
        />
      </div>
    </main>
  );
}
