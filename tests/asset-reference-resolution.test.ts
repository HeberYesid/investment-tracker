import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAssetReferences } from "@/lib/asset-catalog/resolve-references";

const portfolioId = "550e8400-e29b-41d4-a716-446655440000";
const assetId = "550e8400-e29b-41d4-a716-446655440002";
const context = { portfolioId, source: "MANUAL", importId: null } as const;
const items = [{ key: "compra", ticker: "ALFA", decision: { kind: "existing", asset_id: assetId } }] as const;

const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient;

describe("resolución del catálogo con cliente de sesión", () => {
  it("mantiene la correlación y usa el portafolio de servidor", async () => {
    const data = [{ key: "compra", status: "resolved", asset_id: assetId }];
    const rpc = vi.fn().mockResolvedValue({ error: null, data });
    await expect(resolveAssetReferences(client(rpc), context, items)).resolves.toEqual(data);
    expect(rpc.mock.calls).toEqual([["resolve_asset_references", {
      p_portfolio_id: portfolioId, p_source: "MANUAL", p_import_id: null, p_items: items,
    }]]);
  });

  it.each([{ data: [] }, { data: [{ key: "ajena", status: "resolved", asset_id: assetId }] },
    { data: [{ key: "compra", status: "needs_disambiguation", asset_id: assetId }] }])("rechaza resultados sin correlación exacta: $data", async ({ data }) => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data });
    await expect(resolveAssetReferences(client(rpc), context, items)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["40001", "40P01", "42501", "57014"])("reintenta solo conflictos transaccionales conocidos: %s", async (code) => {
    const rpc = vi.fn().mockResolvedValue({ error: { code, message: "detalle interno" }, data: null });
    await expect(resolveAssetReferences(client(rpc), context, items)).rejects.toMatchObject({ code, message: "No se pudo resolver la referencia del activo." });
    expect(rpc).toHaveBeenCalledTimes(["40001", "40P01"].includes(code) ? 2 : 1);
  });
});
