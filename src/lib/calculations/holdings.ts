export type TradeType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "FEE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export type DashboardTrade = {
  asset_id: string;
  broker_id: string;
  trade_type: TradeType;
  trade_date: string;
  quantity: number;
  price_usd: number;
  commission_usd: number;
  total_invested_usd: number;
  deleted_at: string | null;
};

export type AssetMeta = {
  id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  country: string | null;
};

export type BrokerMeta = {
  id: string;
  code: string;
  name: string;
};

export type Holding = {
  assetId: string;
  brokerId: string;
  ticker: string;
  assetName: string | null;
  sector: string | null;
  country: string | null;
  brokerCode: string;
  brokerName: string;
  quantity: number;
  averageCost: number;
  totalInvested: number;
  realizedPnl: number;
};

function active(trades: DashboardTrade[]): DashboardTrade[] {
  return trades.filter((t) => t.deleted_at === null);
}

export function aggregateHoldings(
  trades: DashboardTrade[],
  assets: AssetMeta[],
  brokers: BrokerMeta[],
): Holding[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const brokerMap = new Map(brokers.map((b) => [b.id, b]));

  type Accumulator = {
    quantity: number;
    totalCostBasis: number;
    realizedPnl: number;
  };
  const acc = new Map<string, Accumulator>();

  for (const trade of active(trades)) {
    const key = `${trade.asset_id}::${trade.broker_id}`;
    const current =
      acc.get(key) ?? { quantity: 0, totalCostBasis: 0, realizedPnl: 0 };

    switch (trade.trade_type) {
      case "BUY":
        current.quantity += trade.quantity;
        current.totalCostBasis +=
          trade.quantity * trade.price_usd + trade.commission_usd;
        break;
      case "SELL": {
        const avg =
          current.quantity > 0 ? current.totalCostBasis / current.quantity : 0;
        const proceeds =
          trade.quantity * trade.price_usd - trade.commission_usd;
        const cost = avg * trade.quantity;
        current.realizedPnl += proceeds - cost;
        current.quantity -= trade.quantity;
        current.totalCostBasis -= cost;
        break;
      }
      case "DIVIDEND":
        current.realizedPnl += trade.quantity * trade.price_usd;
        break;
      case "FEE":
        current.totalCostBasis += trade.commission_usd;
        break;
      case "TRANSFER_IN":
        current.quantity += trade.quantity;
        current.totalCostBasis += trade.quantity * trade.price_usd;
        break;
      case "TRANSFER_OUT": {
        const avg =
          current.quantity > 0 ? current.totalCostBasis / current.quantity : 0;
        current.quantity -= trade.quantity;
        current.totalCostBasis -= trade.quantity * avg;
        break;
      }
    }

    acc.set(key, current);
  }

  const result: Holding[] = [];
  for (const [key, value] of acc) {
    const [assetId, brokerId] = key.split("::");
    const asset = assetMap.get(assetId);
    const broker = brokerMap.get(brokerId);
    if (!asset || !broker) continue;

    const averageCost =
      value.quantity > 0 ? value.totalCostBasis / value.quantity : 0;

    result.push({
      assetId,
      brokerId,
      ticker: asset.ticker,
      assetName: asset.name,
      sector: asset.sector,
      country: asset.country,
      brokerCode: broker.code,
      brokerName: broker.name,
      quantity: value.quantity,
      averageCost,
      totalInvested: value.totalCostBasis,
      realizedPnl: value.realizedPnl,
    });
  }

  return   result.sort((a, b) =>
    (a.ticker ?? "").localeCompare(b.ticker ?? ""),
  );
}
