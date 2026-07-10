function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface TwrCashFlow {
  date: string;
  amount: number;
}

export function computeTWR(
  cashFlows: TwrCashFlow[],
  beginValue: number,
  endValue: number,
): number | null {
  if (beginValue === 0 && cashFlows.length === 0) return null;

  const sorted = [...cashFlows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let cumulativeReturn = 1;
  let prevValue = beginValue;

  for (const flow of sorted) {
    const subPeriodReturn =
      prevValue + flow.amount === 0
        ? 0
        : flow.amount / prevValue;

    const periodReturn = 1 + subPeriodReturn;
    if (periodReturn <= 0) return null;

    cumulativeReturn *= periodReturn;
    prevValue = prevValue + flow.amount;
  }

  if (prevValue === 0) return null;

  const finalReturn = endValue / prevValue;
  cumulativeReturn *= finalReturn;

  return round2((cumulativeReturn - 1) * 100);
}

export function computeTWRFromTrades(
  trades: Array<{
    trade_date: string;
    trade_type: string;
    total_invested_usd: number;
  }>,
  beginValue: number,
  endValue: number,
): number | null {
  const cashFlows: TwrCashFlow[] = trades.map((t) => {
    const isInflow =
      t.trade_type === "SELL" ||
      t.trade_type === "DIVIDEND" ||
      t.trade_type === "TRANSFER_OUT";
    const isOutflow =
      t.trade_type === "BUY" ||
      t.trade_type === "FEE" ||
      t.trade_type === "TRANSFER_IN";

    const amount = isInflow
      ? Math.abs(t.total_invested_usd)
      : isOutflow
        ? -Math.abs(t.total_invested_usd)
        : 0;

    return { date: t.trade_date, amount };
  });

  return computeTWR(cashFlows, beginValue, endValue);
}
