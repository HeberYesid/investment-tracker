import { AvanzadoPageClient } from "@/features/avanzado/avanzado-page-client";
import { MainNavigation } from "@/components/layout/main-navigation";
import { getDashboardLabels } from "@/lib/i18n/dashboard";

const labels = getDashboardLabels();

export default function AvanzadoPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            {labels.pageTitleAdvanced}
          </h1>
        </section>

        <AvanzadoPageClient />
      </div>
    </main>
  );
}
