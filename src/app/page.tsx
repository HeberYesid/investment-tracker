import { Suspense } from "react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { LastUpdatedIndicator } from "@/features/dashboard/last-updated-indicator";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { logger } from "@/lib/logger";
import { getCurrentPortfolio } from "@/lib/supabase/auth";
import { fetchLatestTradeDate } from "@/lib/trades/queries";

import { DashboardDataLoader } from "@/features/dashboard/dashboard-data-loader";

const labels = getDashboardLabels();

function DashboardSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-live="polite"
      data-testid="dashboard-skeleton"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-surface-muted ring-1 ring-border-subtle"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-muted ring-1 ring-border-subtle" />
    </div>
  );
}

export default async function Home() {
  // Fetch the latest trade timestamp here (outside <DashboardDataLoader />) so
  // the "Última actualización" badge sits next to the page title and shares the
  // same render scope. `getCurrentPortfolio` and `createUserSupabaseClient`
  // are React-cached, so the calls inside DashboardDataLoader are deduped.
  //
  // Trade-off: a network/RLS error from the latest-trade query would normally
  // bubble up and break the page. We swallow it and fall back to the
  // "no trades yet" copy because the dashboard body still works without this
  // hint — graceful degradation > a blank screen.
  // Catch loguea pero degrada a null para que la página siga renderizando.
  const portfolio = await getCurrentPortfolio();
  let createdAt: string | null = null;
  if (portfolio) {
    try {
      createdAt = await fetchLatestTradeDate(portfolio.portfolioId);
    } catch (error) {
      logger.error(
        "dashboard",
        `Failed to fetch latest trade date for portfolio ${portfolio.portfolioId}:`,
        error,
      );
      createdAt = null;
    }
  }

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {labels.pageTitle}
            </h1>
            <LastUpdatedIndicator createdAt={createdAt} />
          </div>
        </section>

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardDataLoader />
        </Suspense>
      </div>
    </main>
  );
}
