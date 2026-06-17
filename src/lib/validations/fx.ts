import { z } from "zod";

export const SUPPORTED_FX_CURRENCIES = ["USD", "COP"] as const;

export const FxCurrency = z.enum(SUPPORTED_FX_CURRENCIES);
export type FxCurrency = z.infer<typeof FxCurrency>;

export const LatestFxQuery = z.object({
  from: FxCurrency.default("USD"),
  to: FxCurrency.default("COP"),
});

export type LatestFxQuery = z.infer<typeof LatestFxQuery>;

export const LatestFxResponse = z.object({
  fromCurrency: FxCurrency,
  toCurrency: FxCurrency,
  rate: z.number().positive().nullable(),
  observedAt: z.string().nullable(),
  isStale: z.boolean(),
  source: z.string().nullable(),
});

export type LatestFxResponse = z.infer<typeof LatestFxResponse>;

export type LatestFxRow = {
  rate: number;
  observed_at: string;
  source: string | null;
};

export function summarizeLatestFxRate(
  row: LatestFxRow | null,
  now: Date = new Date(),
  staleMs: number = 24 * 60 * 60 * 1000,
): Pick<LatestFxResponse, "rate" | "observedAt" | "isStale" | "source"> {
  if (!row) {
    return { rate: null, observedAt: null, isStale: false, source: null };
  }
  const observed = new Date(row.observed_at).getTime();
  const isStale = Number.isNaN(observed)
    ? true
    : now.getTime() - observed > staleMs;
  return {
    rate: Number(row.rate),
    observedAt: row.observed_at,
    isStale,
    source: row.source,
  };
}
