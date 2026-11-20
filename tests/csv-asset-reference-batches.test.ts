import { describe, expect, it } from "vitest";
import { planCsvAssetReferences } from "@/lib/asset-catalog/csv-references";
import type { AssetDecision } from "@/lib/validations/asset-catalog";

const row = (i: number, ticker = "ALFA") => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ticker });
const nyse = { kind: "new", exchange: "NYSE", currency: "USD", asset_type: "STOCK" } as const;
const bvc = { kind: "new", exchange: "BVC", currency: "COP", asset_type: "STOCK" } as const;

describe("lotes de referencias CSV", () => {
  it("no mezcla mercados ni resuelve filas sin decisión", () => {
    const rows = [row(1), row(2), row(3)];
    const plan = planCsvAssetReferences(rows, new Map<string, AssetDecision>([[rows[0].id, nyse], [rows[1].id, bvc]]));
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].map(({ decision, row_ids }) => [decision, row_ids])).toEqual([[nyse, [rows[0].id]], [bvc, [rows[1].id]]]);
    expect(plan.unresolved).toEqual([rows[2].id]);
  });

  it("parte un grupo repetido por el límite de IDs sin perder filas", () => {
    const rows = Array.from({ length: 601 }, (_, i) => row(i));
    const plan = planCsvAssetReferences(rows, new Map(rows.map(({ id }) => [id, nyse])));
    expect(plan.batches.map((batch) => batch.map(({ row_ids }) => row_ids?.length))).toEqual([[500], [101]]);
    expect(plan.batches.flat().flatMap(({ row_ids }) => row_ids)).toEqual(rows.map(({ id }) => id));
    expect(plan.unresolved).toEqual([]);
  });

  it("no elige por orden descripciones incompatibles para la misma identidad", () => {
    const rows = [row(1), row(2, " alfa ")];
    const decisions = new Map<string, AssetDecision>([[rows[0].id, nyse], [rows[1].id, { ...nyse, asset_type: "ETF" }]]);
    const plan = planCsvAssetReferences(rows, decisions);
    expect(plan.batches).toEqual([]);
    expect(plan.unresolved).toEqual(rows.map(({ id }) => id));
  });
});
