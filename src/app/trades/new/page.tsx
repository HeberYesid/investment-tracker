import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { getTradeLabels } from "@/lib/i18n/trades";

import { NewTradeClient } from "@/features/trades/new-trade-client";

const labels = getTradeLabels();

export default function NewTradePage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/trades"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              {labels.tradesTitle}
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {labels.newTrade}
          </h1>
        </section>

        <NewTradeClient />
      </div>
    </main>
  );
}
