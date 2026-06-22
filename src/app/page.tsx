import { Suspense } from "react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

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
            className="h-24 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100 ring-1 ring-slate-200" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {labels.pageTitle}
          </h1>
        </section>

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardDataLoader />
        </Suspense>
      </div>
    </main>
  );
}
