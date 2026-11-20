import { z } from "zod";
import { getTradeLabels } from "@/lib/i18n/trades";

export const TRADE_TYPES = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "FEE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

export const SUPPORTED_CURRENCIES = ["USD", "COP"] as const;

export const SOURCES = ["MANUAL", "CSV"] as const;

export const TRADE_DECIMAL_SCALE = 8;

function roundTradeFxRate(rate: number): number {
  return Number(rate.toFixed(TRADE_DECIMAL_SCALE));
}

export function isCopToUsdRate(rate: number): boolean {
  const rounded = roundTradeFxRate(rate);
  return rate > 0 && rate < 1 && rounded > 0 && rounded < 1;
}

const validTradeFxOptions = {
  message: getTradeLabels().copFxRateRequired,
  path: ["fx_rate_to_usd"],
};

type TradeFxFields = {
  currency_original: (typeof SUPPORTED_CURRENCIES)[number];
  fx_rate_to_usd: number;
};

export function hasValidTradeFx(input: TradeFxFields): boolean {
  return input.currency_original === "USD" || isCopToUsdRate(input.fx_rate_to_usd);
}

export function normalizeTradeFx<T extends TradeFxFields>(input: T): T {
  return {
    ...input,
    fx_rate_to_usd: input.currency_original === "USD" ? 1 : roundTradeFxRate(input.fx_rate_to_usd),
  };
}

// Los clientes nuevos envían strings; se mantienen los números del contrato anterior.
const nonNegativeDecimalInput = z.union([
  z.string().regex(/^\d+(?:\.\d+)?$/).transform(Number),
  z.number(),
]).pipe(z.number().nonnegative());

const positiveDecimalInput = nonNegativeDecimalInput.pipe(z.number().positive());

const TradeInputFields = z.object({
  portfolio_id: z.string().uuid(),
  broker_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  trade_date: z.string(),
  trade_type: z.enum(TRADE_TYPES),
  quantity: z.number().positive(),
  price_original: z.number().min(0),
  currency_original: z.enum(SUPPORTED_CURRENCIES),
  commission_original: z.number().min(0),
  fx_rate_to_usd: z.number().positive(),
  source: z.enum(SOURCES),
});

export const TradeFxInput = TradeInputFields.pick({ currency_original: true, fx_rate_to_usd: true })
  .refine(hasValidTradeFx, validTradeFxOptions)
  .transform(normalizeTradeFx);

const CreateTradeInputBase = TradeInputFields.extend({
  commission_original: z.number().min(0).default(0),
  fx_rate_to_usd: z.number().positive().default(1),
  source: z.enum(SOURCES).default("MANUAL"),
});

export const CreateTradeInput = CreateTradeInputBase
  .refine(hasValidTradeFx, validTradeFxOptions)
  .transform(normalizeTradeFx);

export type CreateTradeInput = z.infer<typeof CreateTradeInput>;

export const TradeFormInput = z.object({
  trade_date: z.string(),
  trade_type: z.enum(TRADE_TYPES),
  broker_code: z.string().min(1, "Bróker requerido"),
  ticker: z.string().min(1, "Ticker requerido").transform((v) => v.toUpperCase()),
  quantity: z.number().positive(),
  price_original: nonNegativeDecimalInput,
  currency_original: z.enum(SUPPORTED_CURRENCIES),
  commission_original: nonNegativeDecimalInput.default(0),
  fx_rate_to_usd: positiveDecimalInput.default(1),
  portfolio_id: z.string().uuid().optional(),
}).refine(hasValidTradeFx, validTradeFxOptions).transform(normalizeTradeFx);

export type TradeFormInput = z.infer<typeof TradeFormInput>;

export const UpdateTradeInput = TradeInputFields.extend({
  price_original: nonNegativeDecimalInput,
  commission_original: nonNegativeDecimalInput,
  fx_rate_to_usd: positiveDecimalInput,
}).partial();

export type UpdateTradeInput = z.infer<typeof UpdateTradeInput>;

export const TradeDTO = z.object({
  id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  broker_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  trade_date: z.string(),
  trade_type: z.enum(TRADE_TYPES),
  quantity: z.number(),
  price_original: z.string(),
  currency_original: z.enum(SUPPORTED_CURRENCIES),
  commission_original: z.string(),
  fx_rate_to_usd: z.string(),
  price_usd: z.string(),
  commission_usd: z.string(),
  total_invested_usd: z.string(),
  source: z.enum(SOURCES),
  source_file_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  ticker: z.string().optional(),
  asset_name: z.string().optional(),
  broker_name: z.string().optional(),
  broker_code: z.string().optional(),
});

export type TradeDTO = z.infer<typeof TradeDTO>;

export const TradeListQuery = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  ticker: z.string().optional(),
  broker_id: z.string().uuid().optional(),
  broker_code: z.enum(["ETORO", "XTB", "TRII", "ETRADING_BANCOLOMBIA"]).optional(),
  trade_type: z.enum(TRADE_TYPES).optional(),
  currency_original: z.enum(SUPPORTED_CURRENCIES).optional(),
  source: z.enum(SOURCES).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  min_total_usd: z.coerce.number().min(0).optional(),
});

export type TradeListQuery = z.infer<typeof TradeListQuery>;

export type NormalizedTradeValues = {
  price_usd: number;
  commission_usd: number;
  total_invested_usd: number;
};

const MONETARY_KEYS = [
  "price_original",
  "commission_original",
  "fx_rate_to_usd",
  "price_usd",
  "commission_usd",
  "total_invested_usd",
] as const;

export function serializeTradeDTO(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const dto = { ...row };
  for (const key of MONETARY_KEYS) {
    if (typeof dto[key] === "number") {
      dto[key] = String(dto[key]);
    } else if (dto[key] == null) {
      dto[key] = "0";
    }
  }
  return dto;
}

export function normalizeTradeUsdValues(input: CreateTradeInput): NormalizedTradeValues {
  const price_usd = input.price_original * input.fx_rate_to_usd;
  const commission_usd = input.commission_original * input.fx_rate_to_usd;

  let total_invested_usd: number;

  switch (input.trade_type) {
    case "BUY":
      total_invested_usd = input.quantity * price_usd + commission_usd;
      break;
    case "SELL":
      total_invested_usd = -(input.quantity * price_usd - commission_usd);
      break;
    case "DIVIDEND":
      total_invested_usd = -(input.quantity * price_usd);
      break;
    case "FEE":
      total_invested_usd = commission_usd;
      break;
    case "TRANSFER_IN":
      total_invested_usd = input.quantity * price_usd;
      break;
    case "TRANSFER_OUT":
      total_invested_usd = -(input.quantity * price_usd);
      break;
  }

  return { price_usd, commission_usd, total_invested_usd };
}
