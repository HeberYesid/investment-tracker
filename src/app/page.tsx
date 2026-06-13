import { MainNavigation } from "@/components/layout/main-navigation";
import { DashboardPageClient } from "@/features/dashboard/dashboard-page-client";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

const labels = getDashboardLabels();

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-600">
            Base USD · Costo operativo USD 0
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {labels.pageTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            {labels.pageSubtitle}
          </p>
        </section>

        <DashboardPageClient />
      </div>
    </main>
  );
}
