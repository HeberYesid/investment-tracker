import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLastCompleteMonth, getMonthlyPriceWindow, prepareIncompleteMonthlySummary, prepareMonthlyPortfolioSummary, valueMonthlyPortfolioSummary,
} from "@/lib/calculations/monthly-portfolio-summary";
import { isCivilDate } from "@/lib/calculations/position-ledger";
import { countTradesThroughCutoff, loadMonthlyClosingPrices, type DashboardDataWithLedger } from "@/lib/dashboard/loader";
import type { MonthlySummaryResult } from "@/lib/dashboard/monthly-summary-types";

export async function loadMonthlyPortfolioSummary(
  data: DashboardDataWithLedger,
  supabase: SupabaseClient,
  now: Date,
): Promise<MonthlySummaryResult> {
  const period = getLastCompleteMonth(now);
  const complete = data.ledgerTradesComplete === true;
  let input = prepareMonthlyPortfolioSummary(data.ledgerTrades, data.assets, data.brokers, period, complete);
  if (!input) {
    if (complete) {
      return data.ledgerTrades.some((row) => row.deleted_at === null && !isCivilDate(row.trade_date))
        ? { kind: "history-unverified" }
        : { kind: "absent" };
    }
    const count = await countTradesThroughCutoff(data.portfolioId, supabase, period.endDate).catch(() => null);
    if (count === 0) return { kind: "absent" };
    if (count === null || !Number.isSafeInteger(count) || count < 0) return { kind: "history-unverified" };
    input = prepareIncompleteMonthlySummary(period);
  }

  async function loadPrices(cutoff: NonNullable<typeof input>["opening"], cutoffDate: string) {
    if (!cutoff.positions?.length) return new Map<string, string>();
    try {
      return await loadMonthlyClosingPrices(supabase, {
        assetIds: [...new Set(cutoff.positions.map(({ assetId }) => assetId))],
        ...getMonthlyPriceWindow(cutoffDate),
      });
    } catch {
      return null;
    }
  }

  const [opening, closing] = await Promise.all([
    loadPrices(input.opening, period.openingCutoffDate),
    loadPrices(input.closing, period.endDate),
  ]);
  return { kind: "summary", summary: valueMonthlyPortfolioSummary(input, { opening, closing }) };
}
