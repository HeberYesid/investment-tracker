import type { TRADE_TYPES } from "@/lib/validations/trades";

export interface MonthlyPeriod {
  startDate: string;
  endDate: string;
  openingCutoffDate: string;
}

export type MonthlyActivity = Record<(typeof TRADE_TYPES)[number], number>;
export type MonthlyActivityReason = "INCOMPLETE_TRADES" | "UNCLASSIFIABLE_ACTIVITY";
export type MonthlyCutoffReason = "NO_HISTORY" | "INVALID_LEDGER" | "UNSUPPORTED_CURRENCY" | "NO_PRICE" | "INCOMPLETE_TRADES" | "PRICE_READ_FAILED";

export interface MonthlyPortfolioSummary extends MonthlyPeriod {
  openingValueUsd: string | null;
  openingReason: MonthlyCutoffReason | null;
  closingValueUsd: string | null;
  closingReason: MonthlyCutoffReason | null;
  changeUsd: string | null;
  activity: MonthlyActivity | null;
  activityReason: MonthlyActivityReason | null;
}

export type MonthlySummaryResult =
  | { kind: "summary"; summary: MonthlyPortfolioSummary }
  | { kind: "absent" }
  | { kind: "history-unverified" };
