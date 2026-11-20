"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { TRADE_DECIMAL_SCALE, type TradeDTO } from "@/lib/validations/trades";
import { EXPECTED_PORTFOLIO_HEADER } from "@/lib/portfolio-context";
import { errors } from "@/lib/i18n/errors";
import { getTradeLabels } from "@/lib/i18n/trades";

import { TradeForm, type TradeFormValues } from "./trade-form";

const labels = getTradeLabels();

interface EditTradeClientProps {
  trade: TradeDTO;
}

export function EditTradeClient({ trade }: EditTradeClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const initialData: Partial<TradeFormValues> = {
    trade_type: trade.trade_type,
    trade_date: trade.trade_date,
    broker_code: trade.broker_code ?? labels.referenceUnavailable,
    ticker: trade.ticker ?? labels.referenceUnavailable,
    quantity: trade.quantity,
    price_original: Number(trade.price_original),
    currency_original: trade.currency_original,
    commission_original: Number(trade.commission_original),
    fx_rate_to_usd: Number(trade.fx_rate_to_usd),
  };

  const handleSubmit = async (data: TradeFormValues) => {
    setError(null);

    try {
      const res = await fetch(`/api/v1/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [EXPECTED_PORTFOLIO_HEADER]: trade.portfolio_id },
        body: JSON.stringify({
          trade_type: data.trade_type,
          trade_date: data.trade_date,
          quantity: data.quantity,
          price_original: data.price_original.toFixed(TRADE_DECIMAL_SCALE),
          currency_original: data.currency_original,
          commission_original: data.commission_original.toFixed(TRADE_DECIMAL_SCALE),
          fx_rate_to_usd: data.fx_rate_to_usd.toFixed(TRADE_DECIMAL_SCALE),
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.details?.[0]?.message ?? json?.error?.message ?? "Error al actualizar la operación");
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
      <TradeForm mode="edit" initialData={initialData} onSubmit={handleSubmit} />
    </div>
  );
}
