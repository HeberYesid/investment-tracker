"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getTradeLabels } from "@/lib/i18n/trades";
import { BROKER_SEEDS } from "@/lib/reference/brokers";
import { TRADE_TYPES, SUPPORTED_CURRENCIES } from "@/lib/validations/trades";
import type { LatestFxResponse } from "@/lib/validations/fx";

const labels = getTradeLabels();

export const tradeFormSchema = z
  .object({
    trade_type: z.enum(TRADE_TYPES),
    trade_date: z.string().min(1, labels.required),
    broker_code: z.string().min(1, labels.required),
    ticker: z.string().min(1, labels.required),
    quantity: z.coerce.number().positive(labels.positiveNumber),
    price_original: z.coerce.number().min(0, labels.positiveNumber),
    currency_original: z.enum(SUPPORTED_CURRENCIES),
    commission_original: z.coerce.number().min(0),
    fx_rate_to_usd: z.coerce.number().positive(labels.positiveNumber),
  })
  .refine(
    (data) => data.currency_original !== "COP" || data.fx_rate_to_usd !== 1,
    {
      message: labels.copFxRateRequired,
      path: ["fx_rate_to_usd"],
    },
  );

export type TradeFormValues = z.infer<typeof tradeFormSchema>;

interface TradeFormProps {
  mode: "create" | "edit";
  initialData?: Partial<TradeFormValues>;
  onSubmit: (data: TradeFormValues) => void | Promise<void>;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return longDateFormatter.format(d);
}

export function TradeForm({ initialData, onSubmit }: TradeFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TradeFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(tradeFormSchema) as any,
    defaultValues: {
      trade_type: initialData?.trade_type ?? "BUY",
      trade_date: initialData?.trade_date ?? todayString(),
      broker_code: initialData?.broker_code ?? "",
      ticker: initialData?.ticker ?? "",
      quantity: initialData?.quantity ?? 0,
      price_original: initialData?.price_original ?? 0,
      currency_original: initialData?.currency_original ?? "USD",
      commission_original: initialData?.commission_original ?? 0,
      fx_rate_to_usd: initialData?.fx_rate_to_usd ?? 1,
    },
  });

  const currency = watch("currency_original");
  const fxRateValue = watch("fx_rate_to_usd");
  const showFxRate = currency === "COP";

  const [fxRate, setFxRate] = useState<LatestFxResponse | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFxLoading(true);
    setFxError(false);
    fetch("/api/v1/fx/latest?from=USD&to=COP")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: LatestFxResponse) => {
        if (!cancelled) setFxRate(data);
      })
      .catch(() => {
        if (!cancelled) setFxError(true);
      })
      .finally(() => {
        if (!cancelled) setFxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currency !== "COP") return;
    if (!fxRate) return;
    if (fxRateValue !== 1) return;
    if (fxRate.rate && fxRate.rate > 0) {
      setValue("fx_rate_to_usd", fxRate.rate, { shouldDirty: false });
    }
  }, [currency, fxRate, fxRateValue, setValue]);

  const fxFreshness = (() => {
    if (fxLoading) return "loading" as const;
    if (fxError || !fxRate) return "missing" as const;
    if (fxRate.rate === null) return "missing" as const;
    return fxRate.isStale ? ("stale" as const) : ("fresh" as const);
  })();

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="trade_type"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.tradeType}
        </label>
        <select
          id="trade_type"
          {...register("trade_type")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          {TRADE_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
        {errors.trade_type && (
          <p className="text-xs text-red-600">{errors.trade_type.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="trade_date"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.tradeDate}
        </label>
        <input
          id="trade_date"
          type="date"
          {...register("trade_date")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {errors.trade_date && (
          <p className="text-xs text-red-600">{errors.trade_date.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="broker_code"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.broker}
        </label>
        <select
          id="broker_code"
          {...register("broker_code")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          <option value="">Seleccionar bróker</option>
          {BROKER_SEEDS.map((broker) => (
            <option key={broker.code} value={broker.code}>
              {broker.name}
            </option>
          ))}
        </select>
        {errors.broker_code && (
          <p className="text-xs text-red-600">{errors.broker_code.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="ticker"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.ticker}
        </label>
        <input
          id="ticker"
          type="text"
          placeholder="AAPL, MSFT, PFBC..."
          {...register("ticker")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {errors.ticker && (
          <p className="text-xs text-red-600">{errors.ticker.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="quantity"
            className="block text-sm font-medium text-slate-700"
          >
            {labels.quantity}
          </label>
          <input
            id="quantity"
            type="number"
            step="any"
            {...register("quantity")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          {errors.quantity && (
            <p className="text-xs text-red-600">{errors.quantity.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="price_original"
            className="block text-sm font-medium text-slate-700"
          >
            {labels.price}
          </label>
          <input
            id="price_original"
            type="number"
            step="any"
            {...register("price_original")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          {errors.price_original && (
            <p className="text-xs text-red-600">
              {errors.price_original.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="currency_original"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.currency}
        </label>
        <select
          id="currency_original"
          {...register("currency_original")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="commission_original"
          className="block text-sm font-medium text-slate-700"
        >
          {labels.commission}
        </label>
        <input
          id="commission_original"
          type="number"
          step="any"
          {...register("commission_original")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {errors.commission_original && (
          <p className="text-xs text-red-600">
            {errors.commission_original.message}
          </p>
        )}
      </div>

      {showFxRate && (
        <div className="space-y-1.5">
          <label
            htmlFor="fx_rate_to_usd"
            className="block text-sm font-medium text-slate-700"
          >
            {labels.fxRate}
          </label>
          <input
            id="fx_rate_to_usd"
            type="number"
            step="any"
            {...register("fx_rate_to_usd")}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <FxRateIndicator
            status={fxFreshness}
            observedAt={fxRate?.observedAt ?? null}
            source={fxRate?.source ?? null}
          />
          {errors.fx_rate_to_usd && (
            <p className="text-xs text-red-600">
              {errors.fx_rate_to_usd.message}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {labels.loading}
            </>
          ) : (
            labels.save
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => window.history.back()}
        >
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}

interface FxRateIndicatorProps {
  status: "loading" | "fresh" | "stale" | "missing";
  observedAt: string | null;
  source: string | null;
}

function FxRateIndicator({ status, observedAt, source }: FxRateIndicatorProps) {
  if (status === "loading") {
    return (
      <p className="text-xs text-slate-500" data-testid="fx-rate-loading">
        {labels.loading}
      </p>
    );
  }
  if (status === "missing") {
    return (
      <p
        className="text-xs text-amber-600"
        data-testid="fx-rate-missing"
        role="status"
      >
        {labels.fxRateMissing}
      </p>
    );
  }
  const tone =
    status === "fresh"
      ? "text-emerald-600"
      : "text-orange-600";
  const label = status === "fresh" ? labels.fxRateFresh : labels.fxRateStale;
  const formattedDate = formatDate(observedAt);
  const formattedSource = source
    ? labels.fxRateSource.replace("{source}", source)
    : null;
  return (
    <p
      className={`text-xs ${tone}`}
      data-testid={status === "fresh" ? "fx-rate-fresh" : "fx-rate-stale"}
      role="status"
    >
      {label}
      {formattedDate && (
        <>
          {" · "}
          {labels.fxRateUpdatedAt.replace("{date}", formattedDate)}
        </>
      )}
      {formattedSource && <> · {formattedSource}</>}
    </p>
  );
}
