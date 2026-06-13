import { MainNavigation } from "@/components/layout/main-navigation";
import { getImportLabels } from "@/lib/i18n/imports";
import { ImportPageClient } from "@/features/imports/import-page-client";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";

const labels = getImportLabels();

export default async function ImportPage() {
  const portfolio = await requireCurrentPortfolio();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {labels.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {labels.description}
          </p>
        </section>

        <ImportPageClient portfolioId={portfolio.portfolioId} />
      </div>
    </main>
  );
}
