import type { Holding } from "./holdings";
import type { EvolutionInputTrade } from "./evolution";

export type ReturnsGroupBy = "month" | "year" | "stock" | "broker";

export type ReturnsRow = {
  key: string;
  label: string;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  returnPct: number;
};

export type AggregateReturnsInput = {
  groupBy: ReturnsGroupBy;
  trades: EvolutionInputTrade[];
  holdings: Holding[];
  equityByHolding: Map<string, number>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getKey(
  trade: EvolutionInputTrade,
  holding: Holding | undefined,
  groupBy: ReturnsGroupBy,
): { key: string; label: string } {
  const date = trade.trade_date ?? "";
  switch (groupBy) {
    case "month":
      return { key: date.slice(0, 7), label: date.slice(0, 7) };
    case "year":
      return { key: date.slice(0, 4), label: date.slice(0, 4) };
    case "stock":
      return {
        key: holding?.ticker ?? trade.asset_id ?? "",
        label: holding?.ticker ?? trade.asset_id ?? "",
      };
    case "broker":
      return {
        key: holding?.brokerId ?? trade.broker_id ?? "",
        label: holding?.brokerName ?? trade.broker_id ?? "",
      };
  }
}

export function aggregateReturns(input: AggregateReturnsInput): ReturnsRow[] {
  const { groupBy, trades, holdings, equityByHolding } = input;
  const holdingByAssetBroker = new Map<string, Holding>();
  for (const h of holdings) {
    holdingByAssetBroker.set(`${h.assetId}::${h.brokerId}`, h);
  }
  const equityByAsset = new Map<string, number>();
  for (const [assetBrokerKey, equity] of equityByHolding) {
    const [assetId] = assetBrokerKey.split("::");
    equityByAsset.set(
      assetId,
      (equityByAsset.get(assetId) ?? 0) + equity,
    );
  }

  type Bucket = {
    key: string;
    label: string;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    investedUsd: number;
  };
  const buckets = new Map<string, Bucket>();

  const active = trades.filter((t) => t.deleted_at === null);

  for (const trade of active) {
    const holding = holdingByAssetBroker.get(
      `${trade.asset_id}::${trade.broker_id}`,
    );
    const { key, label } = getKey(trade, holding, groupBy);
    const bucket = buckets.get(key) ?? {
      key,
      label,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      investedUsd: 0,
    };

    switch (trade.trade_type) {
      case "BUY":
        bucket.investedUsd +=
          trade.quantity * trade.price_usd + trade.commission_usd;
        break;
      case "SELL":
        bucket.investedUsd -= trade.quantity * trade.price_usd;
        bucket.realizedPnlUsd +=
          trade.quantity * trade.price_usd - trade.commission_usd;
        break;
      case "DIVIDEND":
        bucket.realizedPnlUsd += trade.quantity * trade.price_usd;
        break;
      case "FEE":
        bucket.investedUsd += trade.commission_usd;
        break;
      case "TRANSFER_IN":
        bucket.investedUsd += trade.quantity * trade.price_usd;
        break;
      case "TRANSFER_OUT":
        bucket.investedUsd -= trade.quantity * trade.price_usd;
        break;
    }
    buckets.set(key, bucket);
  }

  for (const holding of holdings) {
    const { key, label } = getKey(
      { asset_id: holding.assetId, broker_id: holding.brokerId, trade_date: "" } as EvolutionInputTrade,
      holding,
      groupBy,
    );
    const bucket = buckets.get(key) ?? {
      key,
      label,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      investedUsd: 0,
    };
    const equity = equityByAsset.get(holding.assetId) ?? 0;
    const unrealized = equity - holding.totalInvested;
    bucket.unrealizedPnlUsd += unrealized;
    buckets.set(key, bucket);
  }

  const rows: ReturnsRow[] = Array.from(buckets.values()).map((b) => {
    const total = b.realizedPnlUsd + b.unrealizedPnlUsd;
    const returnPct =
      b.investedUsd > 0
        ? round2((total / b.investedUsd) * 100)
        : 0;
    return {
      key: b.key,
      label: b.label,
      realizedPnlUsd: round2(b.realizedPnlUsd),
      unrealizedPnlUsd: round2(b.unrealizedPnlUsd),
      totalPnlUsd: round2(total),
      returnPct,
    };
  });

  rows.sort((a, b) => b.totalPnlUsd - a.totalPnlUsd);
  return rows;
}
