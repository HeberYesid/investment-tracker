export type TradeRow = {
  trade_type: "BUY" | "SELL" | "DIVIDEND" | "FEE" | "TRANSFER_IN" | "TRANSFER_OUT";
  quantity: number;
  price_usd: number;
  commission_usd: number;
  total_invested_usd: number;
  deleted_at: string | null;
};

export type PositionSummary = {
  ticker: string;
  quantity: number;
  averageCost: number;
  totalInvested: number;
  realizedPnl: number;
  unrealizedPnl: number;
  returnPct: number;
};

export function filterActiveTrades(trades: TradeRow[]): TradeRow[] {
  return trades.filter((t) => t.deleted_at === null);
}

export function calculatePosition(trades: TradeRow[]): {
  quantity: number;
  averageCost: number;
  totalInvested: number;
  realizedPnl: number;
} {
  const active = filterActiveTrades(trades);

  let quantity = 0;
  let totalCostBasis = 0;
  let realizedPnl = 0;

  for (const trade of active) {
    switch (trade.trade_type) {
      case "BUY":
        quantity += trade.quantity;
        totalCostBasis += trade.quantity * trade.price_usd + trade.commission_usd;
        break;

      case "SELL": {
        const avgCost = quantity > 0 ? totalCostBasis / quantity : 0;
        const proceeds = trade.quantity * trade.price_usd - trade.commission_usd;
        const costBasisSold = avgCost * trade.quantity;
        realizedPnl += proceeds - costBasisSold;
        quantity -= trade.quantity;
        totalCostBasis -= costBasisSold;
        break;
      }

      case "DIVIDEND":
        realizedPnl += trade.quantity * trade.price_usd;
        break;

      case "FEE":
        totalCostBasis += trade.commission_usd;
        break;

      case "TRANSFER_IN":
        quantity += trade.quantity;
        totalCostBasis += trade.quantity * trade.price_usd;
        break;

      case "TRANSFER_OUT": {
        const avgCost = quantity > 0 ? totalCostBasis / quantity : 0;
        quantity -= trade.quantity;
        totalCostBasis -= trade.quantity * avgCost;
        break;
      }
    }
  }

  const averageCost = quantity > 0 ? totalCostBasis / quantity : 0;

  return {
    quantity,
    averageCost,
    totalInvested: totalCostBasis,
    realizedPnl,
  };
}

export function calculateUnrealizedPnl(
  quantity: number,
  averageCost: number,
  currentPrice: number,
): number {
  return (currentPrice - averageCost) * quantity;
}

export function calculateReturnPct(
  totalInvested: number,
  currentValue: number,
  realizedPnl: number,
): number {
  if (totalInvested <= 0) return 0;
  return ((currentValue + realizedPnl - totalInvested) / totalInvested) * 100;
}

export function calculatePortfolioTotalInvested(trades: TradeRow[]): number {
  return filterActiveTrades(trades).reduce((sum, t) => sum + t.total_invested_usd, 0);
}
