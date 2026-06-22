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

/**
 * Calcula la posición actual de un activo usando el método de costo promedio (average cost).
 * 
 * Algoritmo:
 * - BUY: Incrementa quantity y cost basis (total_invested)
 * - SELL: Reduce quantity proporcionalmente y calcula realized P/L
 *   - realized = (sell_price * quantity) - (avg_cost * quantity) - commission
 *   - Usa FIFO implícito via average cost
 * - DIVIDEND: No afecta quantity, suma al realized P/L
 * - FEE: No afecta quantity, incrementa el cost basis
 * - TRANSFER_IN: Como BUY pero sin efecto en realized P/L
 * - TRANSFER_OUT: Como SELL pero sin calcular realized P/L
 * 
 * @param trades - Array de trades (incluye soft-deleted, se filtran internamente)
 * @returns Posición con quantity, average cost, total invested (cost basis), realized P/L
 * 
 * @example
 * const trades = [
 *   { trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 5, ... },
 *   { trade_type: "SELL", quantity: 5, price_usd: 120, commission_usd: 3, ... }
 * ];
 * const pos = calculatePosition(trades);
 * // pos.quantity === 5
 * // pos.averageCost === 100.5
 * // pos.totalInvested === 502.5 (remaining cost basis)
 * // pos.realizedPnl === 94.5 ((120*5 - 3) - (100.5*5))
 */
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
