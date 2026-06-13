import type { Holding } from "./holdings";

export type PortfolioPnl = {
  investedUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalPnlUsd: number;
  returnPct: number;
};

export function calculatePortfolioInvested(holdings: Holding[]): number {
  return holdings.reduce(
    (sum, h) => sum + (h.quantity > 0 ? h.totalInvested : 0),
    0,
  );
}

export function calculatePortfolioRealizedPnl(holdings: Holding[]): number {
  return holdings.reduce((sum, h) => sum + h.realizedPnl, 0);
}

export function calculateUnrealizedPnlFromEquity(
  equityUsd: number,
  investedUsd: number,
): number {
  return equityUsd - investedUsd;
}

export function calculateReturnPct(
  investedUsd: number,
  equityUsd: number,
  realizedPnlUsd: number,
): number {
  if (investedUsd <= 0) return 0;
  return ((equityUsd + realizedPnlUsd - investedUsd) / investedUsd) * 100;
}

export function calculatePortfolioPnl(
  holdings: Holding[],
  equityUsd: number,
): PortfolioPnl {
  const investedUsd = calculatePortfolioInvested(holdings);
  const realizedPnlUsd = calculatePortfolioRealizedPnl(holdings);
  const unrealizedPnlUsd = calculateUnrealizedPnlFromEquity(
    equityUsd,
    investedUsd,
  );
  const totalPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
  const returnPct = calculateReturnPct(
    investedUsd,
    equityUsd,
    realizedPnlUsd,
  );

  return {
    investedUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    totalPnlUsd,
    returnPct,
  };
}
