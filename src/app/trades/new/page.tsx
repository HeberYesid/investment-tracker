import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { getTradeLabels } from "@/lib/i18n/trades";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";

import { NewTradeClient } from "@/features/trades/new-trade-client";

const labels = getTradeLabels();

export default async function NewTradePage() {
  const portfolio = await requireCurrentPortfolio();
  if (portfolio.role === "VIEWER") {
    redirect("/trades?denied=write");
  }

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-surface px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/trades"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              {labels.tradesTitle}
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {labels.newTrade}
          </h1>
        </section>

        <NewTradeClient key={portfolio.portfolioId} portfolioId={portfolio.portfolioId} />
      </div>
    </main>
  );
}
