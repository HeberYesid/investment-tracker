import { z } from "zod";

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

const CreateTradeInputBase = TradeInputFields.extend({
  commission_original: z.number().min(0).default(0),
  fx_rate_to_usd: z.number().positive().default(1),
  source: z.enum(SOURCES).default("MANUAL"),
});

export const CreateTradeInput = CreateTradeInputBase.superRefine((data, ctx) => {
  if (data.currency_original === "COP" && data.fx_rate_to_usd === 1) {
    ctx.addIssue({
      code: "custom",
      message: "Las operaciones en COP requieren una tasa de cambio válida.",
      path: ["fx_rate_to_usd"],
    });
  }

  if (data.trade_type !== "FEE" && data.quantity <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "La cantidad debe ser positiva.",
      path: ["quantity"],
    });
  }
});

export type CreateTradeInput = z.infer<typeof CreateTradeInput>;

export const TradeFormInput = z.object({
  trade_date: z.string(),
  trade_type: z.enum(TRADE_TYPES),
  broker_code: z.string().min(1, "Bróker requerido"),
  ticker: z.string().min(1, "Ticker requerido").transform((v) => v.toUpperCase()),
  quantity: z.number().positive(),
  price_original: z.number().min(0),
  currency_original: z.enum(SUPPORTED_CURRENCIES),
  commission_original: z.number().min(0).default(0),
  fx_rate_to_usd: z.number().positive().default(1),
  portfolio_id: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.currency_original === "COP" && data.fx_rate_to_usd === 1) {
    ctx.addIssue({
      code: "custom",
      message: "Las operaciones en COP requieren una tasa de cambio válida.",
      path: ["fx_rate_to_usd"],
    });
  }
});

export type TradeFormInput = z.infer<typeof TradeFormInput>;

export const UpdateTradeInput = TradeInputFields.partial();

export type UpdateTradeInput = z.infer<typeof UpdateTradeInput>;

export const TradeDTO = z.object({
  id: z.string().uuid(),
  portfolio_id: z.string().uuid(),
  broker_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  trade_date: z.string(),
  trade_type: z.enum(TRADE_TYPES),
  quantity: z.number(),
  price_original: z.number(),
  currency_original: z.enum(SUPPORTED_CURRENCIES),
  commission_original: z.number(),
  fx_rate_to_usd: z.number(),
  price_usd: z.number(),
  commission_usd: z.number(),
  total_invested_usd: z.number(),
  source: z.enum(SOURCES),
  source_file_id: z.string().uuid().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().optional(),
});

export type TradeDTO = z.infer<typeof TradeDTO>;

export const TradeListQuery = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  ticker: z.string().optional(),
  broker_id: z.string().uuid().optional(),
  trade_type: z.enum(TRADE_TYPES).optional(),
  currency_original: z.enum(SUPPORTED_CURRENCIES).optional(),
  source: z.enum(SOURCES).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export type TradeListQuery = z.infer<typeof TradeListQuery>;

export function normalizeTradeUsdValues(input: CreateTradeInput) {
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
