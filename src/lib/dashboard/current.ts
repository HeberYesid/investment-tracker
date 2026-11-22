import { buildPositionLedger } from "@/lib/calculations/position-ledger";
import { valuePositionLedger } from "@/lib/calculations/current-valuation";
import type { DashboardDataWithLedger } from "@/lib/dashboard/loader";

export function buildDashboardValuation(data: DashboardDataWithLedger, now = new Date()) {
  return valuePositionLedger(buildPositionLedger(data.ledgerTrades, data.assets, data.brokers), data.ledgerPrices, now);
}
