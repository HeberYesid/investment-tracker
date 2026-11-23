import type { BrokerMeta } from "@/lib/calculations/holdings";
import { formatLedgerMoney } from "@/lib/calculations/ledger-money";
import {
  buildPositionLedger, isCivilDate, parseLedgerDecimal, QUANTITY_SCALE, type LedgerAsset, type LedgerTrade,
} from "@/lib/calculations/position-ledger";
import type { MonthlyActivity, MonthlyActivityReason, MonthlyCutoffReason, MonthlyPeriod, MonthlyPortfolioSummary } from "@/lib/dashboard/monthly-summary-types";
import { TRADE_TYPES } from "@/lib/validations/trades";

export function getLastCompleteMonth(now: Date): MonthlyPeriod {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(0);
  const endDate = date.toISOString().slice(0, 10);
  date.setUTCDate(1);
  const startDate = date.toISOString().slice(0, 10);
  date.setUTCDate(0);
  return { startDate, endDate, openingCutoffDate: date.toISOString().slice(0, 10) };
}

export function getMonthlyPriceWindow(cutoffDate: string) {
  const midnight = new Date(`${cutoffDate}T00:00:00.000Z`);
  const from = new Date(midnight);
  const to = new Date(midnight);
  from.setUTCDate(from.getUTCDate() - 7);
  to.setUTCDate(to.getUTCDate() + 1);
  return { fromInclusive: from.toISOString(), toExclusive: to.toISOString() };
}

export function selectMonthlyTrades(trades: readonly LedgerTrade[], period: MonthlyPeriod) {
  const openingTrades: LedgerTrade[] = [];
  const closingTrades: LedgerTrade[] = [];
  const periodTrades: LedgerTrade[] = [];
  let hasInvalidDate = false;
  for (const trade of trades) {
    if (trade.deleted_at !== null) continue;
    if (!isCivilDate(trade.trade_date)) {
      hasInvalidDate = true;
      continue;
    }
    if (trade.trade_date > period.endDate) continue;
    closingTrades.push(trade);
    if (trade.trade_date <= period.openingCutoffDate) openingTrades.push(trade);
    if (trade.trade_date >= period.startDate) periodTrades.push(trade);
  }
  return { openingTrades, closingTrades, periodTrades, hasInvalidDate };
}

type Cutoff =
  | { positions: { assetId: string; quantity: bigint }[]; reason?: never }
  | { positions?: never; reason: Exclude<MonthlyCutoffReason, "NO_PRICE" | "PRICE_READ_FAILED"> };

interface MonthlySummaryInput {
  period: MonthlyPeriod;
  opening: Cutoff;
  closing: Cutoff;
  activity: MonthlyActivity | null;
  activityReason: MonthlyActivityReason | null;
}

function countMonthlyActivity(trades: readonly LedgerTrade[]): MonthlyActivity | null {
  const counts: MonthlyActivity = { BUY: 0, SELL: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, DIVIDEND: 0, FEE: 0 };
  for (const { trade_type } of trades) {
    const type = TRADE_TYPES.find((type) => type === trade_type);
    if (!type) return null;
    counts[type]++;
  }
  return counts;
}

function prepareCutoff(
  trades: readonly LedgerTrade[], assets: readonly LedgerAsset[], brokers: readonly BrokerMeta[], hasInvalidDate: boolean,
): Cutoff {
  if (hasInvalidDate) return { reason: "INVALID_LEDGER" };
  if (!trades.length) return { reason: "NO_HISTORY" };
  const ledger = buildPositionLedger(trades, assets, brokers);
  if (ledger.portfolioIssue) return { reason: "INVALID_LEDGER" };
  const positions = [];
  if (ledger.positions.some(({ balance }) => !balance)) return { reason: "INVALID_LEDGER" };
  for (const { assetId, asset, balance } of ledger.positions) {
    if (!balance || balance.quantity <= 0n) continue;
    if (asset?.currency !== "USD") return { reason: "UNSUPPORTED_CURRENCY" };
    positions.push({ assetId, quantity: balance.quantity });
  }
  return { positions };
}

export function prepareIncompleteMonthlySummary(period: MonthlyPeriod): MonthlySummaryInput {
  const cutoff = { reason: "INCOMPLETE_TRADES" } as const;
  return { period, opening: cutoff, closing: cutoff, activity: null, activityReason: cutoff.reason };
}

export function prepareMonthlyPortfolioSummary(
  ledgerTrades: readonly LedgerTrade[], assets: readonly LedgerAsset[], brokers: readonly BrokerMeta[],
  period: MonthlyPeriod, tradesComplete: boolean,
): MonthlySummaryInput | null {
  const selected = selectMonthlyTrades(ledgerTrades, period);
  if (!selected.closingTrades.length) return null;
  if (!tradesComplete) return prepareIncompleteMonthlySummary(period);
  const activity = selected.hasInvalidDate ? null : countMonthlyActivity(selected.periodTrades);
  return {
    period,
    opening: prepareCutoff(selected.openingTrades, assets, brokers, selected.hasInvalidDate),
    closing: prepareCutoff(selected.closingTrades, assets, brokers, selected.hasInvalidDate),
    activity,
    activityReason: activity === null ? "UNCLASSIFIABLE_ACTIVITY" : null,
  };
}

type CutoffPrices = ReadonlyMap<string, string> | null;

function valueCutoff(cutoff: Cutoff, prices: CutoffPrices) {
  if (cutoff.reason) return { value: null, reason: cutoff.reason };
  if (prices === null) return { value: null, reason: "PRICE_READ_FAILED" as const };
  let value = 0n;
  for (const { assetId, quantity } of cutoff.positions) {
    const price = parseLedgerDecimal(prices.get(assetId));
    if (price === null || price <= 0n) return { value: null, reason: "NO_PRICE" as const };
    value += price * quantity * QUANTITY_SCALE;
  }
  return { value, reason: null };
}

export function valueMonthlyPortfolioSummary(
  input: MonthlySummaryInput,
  historyByCutoff: { opening: CutoffPrices; closing: CutoffPrices },
): MonthlyPortfolioSummary {
  const opening = valueCutoff(input.opening, historyByCutoff.opening);
  const closing = valueCutoff(input.closing, historyByCutoff.closing);
  return {
    ...input.period,
    openingValueUsd: opening.value === null ? null : formatLedgerMoney(opening.value),
    openingReason: opening.reason,
    closingValueUsd: closing.value === null ? null : formatLedgerMoney(closing.value),
    closingReason: closing.reason,
    changeUsd: opening.value === null || closing.value === null ? null : formatLedgerMoney(closing.value - opening.value),
    activity: input.activity,
    activityReason: input.activityReason,
  };
}
