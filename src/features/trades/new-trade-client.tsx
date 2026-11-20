"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TradeForm, type TradeFormValues } from "./trade-form";
import { EXPECTED_PORTFOLIO_HEADER } from "@/lib/portfolio-context";
import { errors } from "@/lib/i18n/errors";

export function NewTradeClient({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: TradeFormValues) => {
    setError(null);

    try {
      const res = await fetch("/api/v1/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json", [EXPECTED_PORTFOLIO_HEADER]: portfolioId },
        body: JSON.stringify({
          trade_type: data.trade_type,
          trade_date: data.trade_date,
          broker_code: data.broker_code,
          ticker: data.ticker,
          quantity: data.quantity,
          price_original: data.price_original,
          currency_original: data.currency_original,
          commission_original: data.commission_original,
          fx_rate_to_usd: data.fx_rate_to_usd,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Error al guardar la operación");
      }

      router.push("/trades");
    } catch (err) {
      setError(err instanceof Error ? err.message : errors.unknown);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 ring-1 ring-red-200">
          {error}
        </div>
      )}
      <TradeForm mode="create" onSubmit={handleSubmit} />
    </div>
  );
}
