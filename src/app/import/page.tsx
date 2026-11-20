import { MainNavigation } from "@/components/layout/main-navigation";
import { getImportLabels } from "@/lib/i18n/imports";
import { ImportPageClient } from "@/features/imports/import-page-client";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";

const labels = getImportLabels();

export default async function ImportPage() {
  const portfolio = await requireCurrentPortfolio();
  const readOnly = portfolio.role === "VIEWER";

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {labels.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {labels.description}
          </p>
        </section>

        <ImportPageClient
          key={portfolio.portfolioId}
          portfolioId={portfolio.portfolioId}
          readOnly={readOnly}
        />
      </div>
    </main>
  );
}
