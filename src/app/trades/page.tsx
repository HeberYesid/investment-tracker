import Link from "next/link";

import { Plus } from "lucide-react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { Button } from "@/components/ui/button";
import { getTradeLabels } from "@/lib/i18n/trades";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { fetchTradesPage } from "@/lib/trades/queries";
import { TradeListQuery } from "@/lib/validations/trades";

import { TradesPageClient } from "@/features/trades/trades-page-client";

const labels = getTradeLabels();

const INITIAL_LIMIT = 50;
const SMALL_TRADE_THRESHOLD_USD = 1;

export default async function TradesPage() {
  await requireCurrentPortfolio();
  const supabase = await createUserSupabaseClient();

  const initialQuery = TradeListQuery.parse({
    page: 1,
    limit: INITIAL_LIMIT,
    min_total_usd: SMALL_TRADE_THRESHOLD_USD,
  });

  const initialData = await fetchTradesPage(supabase, initialQuery);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <MainNavigation />

        <section className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {labels.tradesTitle}
            </h1>
            <Button asChild size="sm">
              <Link href="/trades/new">
                <Plus className="mr-1.5 h-4 w-4" />
                {labels.newTrade}
              </Link>
            </Button>
          </div>
        </section>

        <TradesPageClient initialData={initialData} />
      </div>
    </main>
  );
}
