import { Suspense } from "react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { SyncNowButton } from "@/features/dashboard/sync-now-button";
import { StalePriceSyncTrigger } from "@/features/dashboard/stale-price-sync-trigger";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { logger } from "@/lib/logger";
import { evaluateFreshness, getMarketDataFreshness } from "@/lib/market-data/freshness";
import { getPortfolioContext } from "@/lib/supabase/auth";
import { portfolioStrings } from "@/lib/i18n/portfolios";

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
  const context = await getPortfolioContext();
  let shouldBackgroundSync = false;
  let canSync = false;
  let lastSyncFinishedAt: string | null = null;

  if (context.kind === "active") {
    try {
      const freshness = await getMarketDataFreshness(context.supabase);
      if (freshness) {
        const evaluation = evaluateFreshness(freshness);
        shouldBackgroundSync = evaluation.shouldBackgroundSync;
        lastSyncFinishedAt = freshness.lastSyncFinishedAt;
      }
    } catch (error) {
      logger.error("dashboard", "Failed to fetch market data freshness:", error);
    }

    canSync = context.portfolio.role === "OWNER";
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
            {context.kind === "active" && (
              <div className="flex items-center gap-3">
                <SyncNowButton lastSyncedAt={lastSyncFinishedAt} />
              </div>
            )}
          </div>
        </section>

        {context.kind === "active" && (
          <StalePriceSyncTrigger
            shouldSync={shouldBackgroundSync}
            canSync={canSync}
          />
        )}

        {context.kind === "active" || context.kind === "anonymous" ? (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardDataLoader context={context} />
          </Suspense>
        ) : (
          <p role="status" className="rounded-2xl bg-surface-muted p-4 text-text-secondary">
            {context.kind === "no-membership" ? portfolioStrings.noMembership : portfolioStrings.membershipError}
          </p>
        )}
      </div>
    </main>
  );
}
