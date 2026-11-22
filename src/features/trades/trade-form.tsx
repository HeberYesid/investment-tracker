"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getTradeLabels } from "@/lib/i18n/trades";
import { BROKER_SEEDS } from "@/lib/reference/brokers";
import { TRADE_TYPES, SUPPORTED_CURRENCIES, TradeQuantityInput, hasValidTradeFx, isCopToUsdRate, normalizeTradeFx } from "@/lib/validations/trades";
import { LatestFxResponse } from "@/lib/validations/fx";

import { AssetDecision, CatalogTicker, type CandidateGroup } from "@/lib/validations/asset-catalog";
import { ReferenceChoice, ReferenceSearch } from "@/features/asset-catalog/reference-choice";
import { errors as errorMessages } from "@/lib/i18n/errors";

const labels = getTradeLabels();

export const tradeFormSchema = TradeQuantityInput
  .safeExtend({
    trade_date: z.string().min(1, labels.required),
    broker_code: z.string().min(1, labels.required),
    ticker: z.string().min(1, labels.required),
    asset_reference: AssetDecision.optional(),
    price_original: z.coerce.number().min(0, labels.positiveNumber),
    currency_original: z.enum(SUPPORTED_CURRENCIES),
    commission_original: z.coerce.number().min(0),
    fx_rate_to_usd: z.coerce.number(),
  })
  .refine(
    hasValidTradeFx,
    {
      message: labels.copFxRateRequired,
      path: ["fx_rate_to_usd"],
    },
  ).transform(normalizeTradeFx);

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

const inputClass =
  "h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 text-sm text-text-primary placeholder:text-text-subtle focus:border-border-default focus:outline-none focus:ring-2 focus:ring-focus-ring";
const labelClass = "block text-sm font-medium text-text-secondary";

export function TradeForm({ mode, initialData, onSubmit }: TradeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    getValues,
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
      quantity: initialData?.quantity,
      price_original: initialData?.price_original ?? 0,
      currency_original: initialData?.currency_original ?? "USD",
      commission_original: initialData?.commission_original ?? 0,
      fx_rate_to_usd: initialData?.fx_rate_to_usd ?? 1,
    },
  });
  const tickerValue = useWatch({ control, name: "ticker" });
  const tradeType = useWatch({ control, name: "trade_type" });
  const quantityHintId = useId();
  const quantityMessage = errors.quantity?.message ?? (tradeType === "FEE" ? labels.feeQuantityZero : undefined);
  const tickerField = register("ticker");
  const ticker = CatalogTicker.safeParse(tickerValue);
  const [references, setReferences] = useState<CandidateGroup[]>([]);
  const [choiceError, setChoiceError] = useState(false);
  const submit = handleSubmit((value) => {
    if (mode === "create" && !value.asset_reference) { setChoiceError(true); return; }
    return onSubmit(value);
  });

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-3xl bg-surface p-5 shadow-sm ring-1 ring-border-subtle sm:p-6"
    >
      <div className="space-y-1.5">
        <label htmlFor="trade_type" className={labelClass}>
          {labels.tradeType}
        </label>
        <select
          id="trade_type"
          {...register("trade_type")}
          className={inputClass}
        >
          {TRADE_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels[type]}
            </option>
          ))}
        </select>
        {errors.trade_type && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.trade_type.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="trade_date" className={labelClass}>
          {labels.tradeDate}
        </label>
        <input
          id="trade_date"
          type="date"
          {...register("trade_date")}
          className={inputClass}
        />
        {errors.trade_date && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.trade_date.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="broker_code" className={labelClass}>
          {labels.broker}
        </label>
        {mode === "edit" ? (
          <input id="broker_code" readOnly {...register("broker_code")} className={inputClass} />
        ) : (
          <select id="broker_code" {...register("broker_code")} className={inputClass}>
            <option value="">{labels.selectBroker}</option>
            {BROKER_SEEDS.map((broker) => (
              <option key={broker.code} value={broker.code}>
                {broker.name}
              </option>
            ))}
          </select>
        )}
        {errors.broker_code && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.broker_code.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticker" className={labelClass}>
          {labels.ticker}
        </label>
        <input
          id="ticker"
          type="text"
          readOnly={mode === "edit"}
          placeholder="AAPL, MSFT, PFBC..."
          {...tickerField}
          onChange={(event) => {
            void tickerField.onChange(event);
            setValue("asset_reference", undefined);
            setChoiceError(false);
          }}
          className={inputClass}
        />
        {errors.ticker && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.ticker.message}
          </p>
        )}
      </div>

      {mode === "create" && ticker.success && <div className="space-y-2" key={tickerValue}>
        <ReferenceSearch tickers={[ticker.data]} onLoad={setReferences} />
        <ReferenceChoice group={references.find(({ ticker: key }) => key === ticker.data)} required
          onChange={(decision) => { setValue("asset_reference", decision ?? undefined); setChoiceError(false); }} />
        {choiceError && <p role="alert" className="text-sm text-red-600">{errorMessages.assetReferenceChoice}</p>}
      </div>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="quantity" className={labelClass}>
            {labels.quantity}
          </label>
          <input
            id="quantity"
            type="number"
            step="any"
            aria-required="true"
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={quantityMessage ? quantityHintId : undefined}
            {...register("quantity", { valueAsNumber: true })}
            className={inputClass}
          />
          {quantityMessage && (
            <p id={quantityHintId} className={errors.quantity ? "text-xs text-red-600 dark:text-red-400" : "text-xs text-text-muted"}>
              {quantityMessage}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price_original" className={labelClass}>
            {labels.price}
          </label>
          <input
            id="price_original"
            type="number"
            step="any"
            {...register("price_original")}
            className={inputClass}
          />
          {errors.price_original && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.price_original.message}
            </p>
          )}
        </div>
      </div>

      <FxCurrencyField
        control={control}
        register={register}
        errors={errors}
        getValues={getValues}
        setValue={setValue}
      />

      <div className="space-y-1.5">
        <label htmlFor="commission_original" className={labelClass}>
          {labels.commission}
        </label>
        <input
          id="commission_original"
          type="number"
          step="any"
          {...register("commission_original")}
          className={inputClass}
        />
        {errors.commission_original && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {errors.commission_original.message}
          </p>
        )}
      </div>

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

interface FxCurrencyFieldProps {
  control: Control<TradeFormValues>;
  register: ReturnType<typeof useForm<TradeFormValues>>["register"];
  errors: ReturnType<typeof useForm<TradeFormValues>>["formState"]["errors"];
  getValues: ReturnType<typeof useForm<TradeFormValues>>["getValues"];
  setValue: ReturnType<typeof useForm<TradeFormValues>>["setValue"];
}

function FxCurrencyField({
  control,
  register,
  errors,
  getValues,
  setValue,
}: FxCurrencyFieldProps) {
  const currency = useWatch({ control, name: "currency_original" });

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="currency_original" className={labelClass}>
          {labels.currency}
        </label>
        <select
          id="currency_original"
          {...register("currency_original")}
          className={inputClass}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {currency === "COP" && (
        <div className="space-y-1.5">
          <label htmlFor="fx_rate_to_usd" className={labelClass}>
            {labels.fxRate}
          </label>
          <input
            id="fx_rate_to_usd"
            type="number"
            step="any"
            {...register("fx_rate_to_usd")}
            className={inputClass}
          />
          <CopFxSuggestion getValues={getValues} setValue={setValue} />
          {errors.fx_rate_to_usd && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.fx_rate_to_usd.message}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function CopFxSuggestion({ getValues, setValue }: Pick<FxCurrencyFieldProps, "getValues" | "setValue">) {
  const [shouldSuggest] = useState(() => Number(getValues("fx_rate_to_usd")) === 1);
  const [quote, setQuote] = useState<LatestFxResponse | null>();

  useEffect(() => {
    if (!shouldSuggest) return;
    const controller = new AbortController();

    async function loadQuote() {
      try {
        const response = await fetch("/api/v1/fx/latest?from=COP&to=USD", { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = LatestFxResponse.parse(await response.json());
        if (controller.signal.aborted) return;
        if (data.fromCurrency !== "COP" || data.toCurrency !== "USD" ||
          data.rate === null || !isCopToUsdRate(data.rate)) {
          setQuote(null);
          return;
        }
        if (getValues("currency_original") === "COP" && getValues("fx_rate_to_usd") === 1) {
          setValue("fx_rate_to_usd", data.rate, { shouldValidate: true });
        }
        setQuote(data);
      } catch {
        if (!controller.signal.aborted) setQuote(null);
      }
    }

    void loadQuote();
    return () => controller.abort();
  }, [getValues, setValue, shouldSuggest]);

  if (!shouldSuggest) return null;
  return <FxRateIndicator
    status={quote === undefined ? "loading" : quote === null ? "missing" : quote.isStale ? "stale" : "fresh"}
    observedAt={quote?.observedAt ?? null}
    source={quote?.source ?? null}
  />;
}

interface FxRateIndicatorProps {
  status: "loading" | "fresh" | "stale" | "missing";
  observedAt: string | null;
  source: string | null;
}

function FxRateIndicator({ status, observedAt, source }: FxRateIndicatorProps) {
  if (status === "loading") {
    return (
      <p className="text-xs text-text-muted" data-testid="fx-rate-loading">
        {labels.loading}
      </p>
    );
  }
  if (status === "missing") {
    return (
      <p
        className="text-xs text-amber-600 dark:text-amber-400"
        data-testid="fx-rate-missing"
        role="status"
      >
        {labels.fxRateMissing}
      </p>
    );
  }
  const tone =
    status === "fresh"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-orange-600 dark:text-orange-400";
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
