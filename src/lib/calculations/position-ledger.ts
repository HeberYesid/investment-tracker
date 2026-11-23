import type { AssetMeta, BrokerMeta } from "@/lib/calculations/holdings";
import type { LedgerIssue } from "@/lib/validations/dashboard";

export type LedgerTrade = {
  id: string;
  asset_id: string;
  broker_id: string;
  trade_date: string;
  trade_type: string;
  quantity: string;
  price_usd: string;
  commission_usd: string;
  deleted_at: string | null;
};

export type LedgerAsset = AssetMeta & { exchange?: string | null; currency?: string | null };
export type LedgerPrice = { asset_id: string; price_usd: string; observed_at: string; delayed_until: string | null };
export type LedgerBalance = { quantity: bigint; cost: bigint; realized: bigint };
export type LedgerPosition = {
  assetId: string;
  brokerId: string;
  asset?: LedgerAsset;
  broker?: BrokerMeta;
} & ({ balance: LedgerBalance; issue?: undefined } | { balance: null; issue: LedgerIssue });

export const QUANTITY_SCALE = 10n ** 8n;
export const MONEY_SCALE = QUANTITY_SCALE ** 3n;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const inputDecimal = /^\d{1,12}(?:\.\d{1,8})?$/;
const tradeTypes = new Set(["BUY", "SELL", "TRANSFER_IN", "TRANSFER_OUT", "DIVIDEND", "FEE"]);

export function isCivilDate(value: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseLedgerDecimal(value: unknown) {
  if (typeof value !== "string" || !inputDecimal.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(8, "0"));
}

function proportional(cost: bigint, removed: bigint, quantity: bigint) {
  if (!removed) return 0n;
  return (cost * removed + quantity / 2n) / quantity;
}

export function buildPositionLedger(trades: readonly LedgerTrade[], assets: readonly LedgerAsset[], brokers: readonly BrokerMeta[]) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const brokerById = new Map(brokers.map((broker) => [broker.id, broker]));
  const groups = new Map<string, LedgerTrade[]>();
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  let portfolioIssue: LedgerIssue | undefined;
  let hasActiveTrades = false;
  for (const trade of trades) {
    if (trade.deleted_at !== null) continue;
    hasActiveTrades = true;
    if (!uuid.test(trade.asset_id) || !uuid.test(trade.broker_id)) {
      portfolioIssue = { code: "INVALID_TRADE", tradeDate: null };
      continue;
    }
    const key = `${trade.asset_id.toLowerCase()}::${trade.broker_id.toLowerCase()}`;
    if (uuid.test(trade.id)) {
      const id = trade.id.toLowerCase();
      if (seen.has(id)) duplicateIds.add(id);
      seen.add(id);
    }
    const group = groups.get(key);
    if (group) group.push(trade);
    else groups.set(key, [trade]);
  }

  const positions: LedgerPosition[] = [];
  for (const key of [...groups.keys()].sort(compare)) {
    const group = groups.get(key)!;
    const [assetId, brokerId] = key.split("::");
    const position = { assetId, brokerId, asset: assetById.get(assetId), broker: brokerById.get(brokerId) };
    if (group.some((row) => !isCivilDate(row.trade_date))) {
      positions.push({ ...position, balance: null, issue: { code: "INVALID_TRADE", tradeDate: null } });
      continue;
    }
    group.sort((a, b) => compare(a.trade_date, b.trade_date) || compare(String(a.id).toLowerCase(), String(b.id).toLowerCase()));
    let quantity = 0n;
    let cost = 0n;
    let realized = 0n;
    let issue: LedgerIssue | undefined;
    for (let index = 0; index < group.length;) {
      const date = group[index].trade_date;
      let added = 0n, removed = 0n, sold = 0n, costAdded = 0n, proceeds = 0n, separateFees = 0n;
      do {
        const row = group[index++];
        const q = parseLedgerDecimal(row.quantity);
        const price = parseLedgerDecimal(row.price_usd);
        const commission = parseLedgerDecimal(row.commission_usd);
        if (!uuid.test(row.id) || duplicateIds.has(row.id.toLowerCase()) || !tradeTypes.has(row.trade_type) ||
          q === null || price === null || commission === null || (row.trade_type === "FEE" ? q !== 0n : q === 0n)) {
          issue = { code: "INVALID_TRADE", tradeDate: date };
          break;
        }
        const gross = q * price * QUANTITY_SCALE;
        const fee = commission * (MONEY_SCALE / QUANTITY_SCALE);
        switch (row.trade_type) {
          case "BUY": added += q; costAdded += gross + fee; break;
          case "TRANSFER_IN": added += q; costAdded += gross; break;
          case "SELL": sold += q; removed += q; proceeds += gross - fee; break;
          case "TRANSFER_OUT": removed += q; break;
          case "DIVIDEND": realized += gross; break;
          case "FEE": separateFees += fee; break;
        }
      } while (index < group.length && group[index].trade_date === date);
      if (issue) break;
      if (removed > quantity + added) {
        issue = { code: "INSUFFICIENT_QUANTITY", tradeDate: date };
        break;
      }
      if ((added > 0n && removed > 0n) || (separateFees > 0n && (removed > 0n || (added > 0n && quantity === 0n)))) {
        issue = { code: "AMBIGUOUS_DAY_ORDER", tradeDate: date };
        break;
      }
      if (quantity > 0n) costAdded += separateFees;
      else realized -= separateFees;
      const removedCost = proportional(cost, removed, quantity);
      const soldCost = sold === removed ? removedCost : proportional(cost, sold, quantity);
      quantity += added - removed;
      cost += costAdded - removedCost;
      realized += proceeds - soldCost;
    }
    positions.push(issue ? { ...position, balance: null, issue } : { ...position, balance: { quantity, cost, realized } });
  }
  return { positions, portfolioIssue, hasActiveTrades };
}
