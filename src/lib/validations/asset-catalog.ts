import { z } from "zod";

export const ASSET_EXCHANGES = ["NASDAQ", "NYSE", "BVC"] as const;
export const NEW_ASSET_TYPES = ["STOCK", "ETF"] as const;
export const ASSET_QUOTE_CURRENCIES = ["USD", "COP"] as const;
export const AssetId = z.guid().transform((value) => value.toLowerCase());

export function normalizeCatalogTicker(ticker: string) {
  return ticker.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, "").replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export const CatalogTicker = z.string().transform(normalizeCatalogTicker)
  .pipe(z.string().min(1).max(128).regex(/^[^\p{Cc}]+$/u));

export const AssetDecision = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("existing"), asset_id: AssetId,
    exchange: z.string().min(1).max(64).optional(), currency: z.enum(ASSET_QUOTE_CURRENCIES).optional(),
    asset_type: z.enum(["STOCK", "ETF", "CRYPTO_FUTURE"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("new"), exchange: z.enum(ASSET_EXCHANGES), currency: z.enum(ASSET_QUOTE_CURRENCIES),
    asset_type: z.enum(NEW_ASSET_TYPES),
  }),
]);
export type AssetDecision = z.infer<typeof AssetDecision>;

export const ResolutionResult = z.discriminatedUnion("status", [
  z.strictObject({ key: z.string(), status: z.literal("resolved"), asset_id: AssetId }),
  z.strictObject({ key: z.string(), status: z.literal("needs_disambiguation") }),
  z.strictObject({ key: z.string(), status: z.literal("invalid_reference") }),
]);
export type ResolutionResult = z.infer<typeof ResolutionResult>;

export const CandidateGroups = z.array(z.object({
  ticker: CatalogTicker,
  truncated: z.boolean(),
  candidates: z.array(z.object({
    id: AssetId, ticker: z.string(), exchange: z.string().nullable(), name: z.string().nullable(),
    currency: z.enum(ASSET_QUOTE_CURRENCIES), asset_type: z.enum(["STOCK", "ETF", "CRYPTO_FUTURE"]),
  })).max(10),
})).max(50);
export type CandidateGroup = z.infer<typeof CandidateGroups>[number];
