import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import { MainNavigation } from "@/components/layout/main-navigation";
import { getTradeLabels } from "@/lib/i18n/trades";
import { createUserSupabaseClient } from "@/lib/supabase/server";
import { requireCurrentPortfolio } from "@/lib/supabase/auth";
import { TradeDTO, serializeTradeDTO } from "@/lib/validations/trades";

import { EditTradeClient } from "@/features/trades/edit-trade-client";

const labels = getTradeLabels();

interface EditTradePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTradePage({ params }: EditTradePageProps) {
  const portfolio = await requireCurrentPortfolio();
  if (portfolio.role === "VIEWER") {
    redirect("/trades?denied=write");
  }

  const { id } = await params;
  const supabase = await createUserSupabaseClient();

  const { data, error } = await supabase
    .from("trades")
    .select("*, asset:assets(ticker), broker:brokers(code)")
    .eq("id", id)
    .eq("portfolio_id", portfolio.portfolioId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    notFound();
  }

  const asset = Array.isArray(data.asset) ? data.asset[0] : data.asset;
  const broker = Array.isArray(data.broker) ? data.broker[0] : data.broker;
  const trade = TradeDTO.parse(serializeTradeDTO({
    ...data,
    ticker: asset?.ticker,
    broker_code: broker?.code,
  }));

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
            {labels.editTrade}
          </h1>
        </section>

        <EditTradeClient trade={trade} />
      </div>
    </main>
  );
}
