import { CatalogTicker, type AssetDecision } from "@/lib/validations/asset-catalog";
import type { ReferenceItem } from "./resolve-references";

type Row = { id: string; ticker: string };

export function planCsvAssetReferences(rows: Row[], decisions: ReadonlyMap<string, AssetDecision>) {
  const groups = new Map<string, { ticker: string; decision: AssetDecision; ids: string[] }>();
  const claims = new Map<string, string>();
  const conflicts = new Set<string>();
  const unresolved: string[] = [];

  for (const { id, ticker: rawTicker } of rows) {
    const decision = decisions.get(id);
    const parsed = CatalogTicker.safeParse(rawTicker);
    if (!decision || !parsed.success) { unresolved.push(id); continue; }
    const ticker = parsed.data;
    const identity = JSON.stringify([ticker, decision.exchange]);
    const key = JSON.stringify([ticker, decision.kind, decision.kind === "existing" ? decision.asset_id : null, decision.exchange, decision.currency, decision.asset_type]);
    if (decision.kind === "new") {
      const previous = claims.get(identity);
      if (previous && previous !== key) conflicts.add(identity);
      claims.set(identity, key);
    }
    const group = groups.get(key) ?? { ticker, decision, ids: [] };
    group.ids.push(id);
    groups.set(key, group);
  }

  const batches: ReferenceItem[][] = [];
  let batch: ReferenceItem[] = [];
  let idsUsed = 0;
  let bytesUsed = 2;
  let serial = 0;
  const flush = () => {
    if (batch.length) batches.push(batch);
    batch = [];
    idsUsed = 0;
    bytesUsed = 2;
  };
  for (const { ticker, decision, ids } of groups.values()) {
    if (decision.kind === "new" && conflicts.has(JSON.stringify([ticker, decision.exchange]))) {
      unresolved.push(...ids);
      continue;
    }
    for (let offset = 0; offset < ids.length;) {
      if (idsUsed === 500) flush();
      const row_ids = ids.slice(offset, offset + 500 - idsUsed);
      const item = { key: String(++serial), ticker, decision, row_ids };
      // PostgreSQL jsonb::text incluye espacios entre tokens. El margen mantiene ambos tamaños bajo 256 KiB.
      const size = Buffer.byteLength(JSON.stringify(item), "utf8") + row_ids.length + 40;
      if (bytesUsed + size > 250_000) flush();
      batch.push(item);
      bytesUsed += size;
      idsUsed += row_ids.length;
      offset += row_ids.length;
    }
  }
  flush();
  return { batches, unresolved };
}
