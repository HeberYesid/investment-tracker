import type { SupabaseClient } from "@supabase/supabase-js";

import { ResolutionResult, type AssetDecision } from "@/lib/validations/asset-catalog";

export type ReferenceItem = { key: string; ticker: string; decision?: AssetDecision; row_ids?: string[] };
type ResolutionContext = { portfolioId: string } & (
  { source: "MANUAL"; importId: null } | { source: "CSV"; importId: string }
);

export class AssetResolutionError extends Error {
  constructor(readonly code: string) {
    super("No se pudo resolver la referencia del activo.");
  }
}

export async function resolveAssetReferences(
  supabase: SupabaseClient,
  context: ResolutionContext,
  items: readonly ReferenceItem[],
): Promise<ResolutionResult[]> {
  const expectedKeys = new Set(items.map(({ key }) => key));
  if (expectedKeys.size !== items.length) throw new AssetResolutionError("CATALOG_REQUEST");

  const args = { p_portfolio_id: context.portfolioId, p_source: context.source, p_import_id: context.importId, p_items: items };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase.rpc("resolve_asset_references", args);
    if (error) {
      if (attempt === 0 && (error.code === "40001" || error.code === "40P01")) continue;
      throw new AssetResolutionError(error.code);
    }
    const result = ResolutionResult.array().safeParse(data);
    if (!result.success || result.data.length !== items.length || result.data.some(({ key }) => !expectedKeys.delete(key))) {
      throw new AssetResolutionError("CATALOG_RESPONSE");
    }
    return result.data;
  }
  throw new AssetResolutionError("CATALOG_REQUEST");
}
