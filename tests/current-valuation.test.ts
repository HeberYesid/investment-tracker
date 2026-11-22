import { expect, it } from "vitest";
import { buildPositionLedger, type LedgerTrade, type LedgerPrice } from "@/lib/calculations/position-ledger";
import { valuePositionLedger, projectSummary, aggregateCurrentReturns, projectDistribution } from "@/lib/calculations/current-valuation";

const a = "30000000-0000-4000-8000-000000000001";
const b = "30000000-0000-4000-8000-000000000002";
const x = "40000000-0000-4000-8000-000000000001";
const y = "40000000-0000-4000-8000-000000000002";
const date = "2026-11-19T16:00:00Z";
const trade = (id: number, changes: Partial<LedgerTrade> = {}): LedgerTrade => ({
  id: `50000000-0000-4000-8000-00000000000${id}`, asset_id: a, broker_id: x, trade_date: "2025-01-10",
  trade_type: "BUY", quantity: "1", price_usd: "100", commission_usd: "0", deleted_at: null, ...changes,
});
const sell = (id: number, changes: Partial<LedgerTrade> = {}) => trade(id, {
  trade_type: "SELL", price_usd: "120", trade_date: "2025-01-11", ...changes,
});
const quote = { asset_id: a, price_usd: "110", observed_at: date, delayed_until: null };
const meta = [a, b].map((id, i) => ({ id, ticker: "ALFA", name: null, sector: null, country: null, exchange: i ? "BVC" : "NYSE" }));
const value = (rows: LedgerTrade[], quotes: LedgerPrice[] = [quote]) => valuePositionLedger(buildPositionLedger(rows, meta, []), quotes, new Date(date));

it("valoracion_y_cinco_sumas_reconciliadas", () => {
  const valued = value([trade(1, { quantity: "2" }), sell(2), trade(3, { broker_id: y })]);
  const amounts = { investedUsd: "200", realizedPnlUsd: "20", unrealizedPnlUsd: "20", totalPnlUsd: "40" };
  expect(projectSummary(valued)).toMatchObject({ equityUsd: "220", holdingsCount: 2, ...amounts });
  expect(aggregateCurrentReturns(valued, "stock").rows).toMatchObject([{ key: a, actualUsd: "220", ...amounts }]);
  expect(aggregateCurrentReturns(valued, "broker").rows).toMatchObject([
    { key: x, actualUsd: "110", investedUsd: "100", realizedPnlUsd: "20", unrealizedPnlUsd: "10", totalPnlUsd: "30" },
    { key: y, actualUsd: "110", investedUsd: "100", realizedPnlUsd: "0", unrealizedPnlUsd: "10", totalPnlUsd: "10" },
  ]);
  const closed = value([trade(1), sell(2), trade(3, { asset_id: b, price_usd: "0.00000001", quantity: "0.00000001" })]);
  expect(aggregateCurrentReturns(closed, "stock").rows).toMatchObject([
    { key: a, label: "ALFA · NYSE", actualUsd: "0", realizedPnlUsd: "20" },
    { key: b, label: "ALFA · BVC", actualUsd: "0.0000000000000001", realizedPnlUsd: "0" },
  ]);
});

it.each(["NYSE", null])("etiquetas_con_uuid_para_homonimos_con_mercado_%s", (exchange) => {
  const ledger = buildPositionLedger([trade(1), trade(2, { asset_id: b })], meta.map(m => ({ ...m, exchange })), []);
  const rows = aggregateCurrentReturns(valuePositionLedger(ledger, [], new Date(date)), "stock").rows;
  const prefix = exchange ? "ALFA · NYSE · " : "ALFA · ";
  expect(rows.map(({ key, label }) => [key, label])).toEqual([[a, prefix + a], [b, prefix + b]]);
});

it("distribucion_usa_valor_y_no_pl", () => {
  const rows = [trade(1), trade(2, { broker_id: y }), trade(3, { asset_id: b }), sell(4, { asset_id: b })];
  const valued = value(rows, [{ ...quote, observed_at: "2026-11-19T10:00:00Z" }]);
  expect(projectSummary(valued)).toMatchObject({ isAnyStale: true, isEstimated: false, staleTickers: ["ALFA"] });
  expect(projectDistribution(valued, "broker")).toMatchObject({ totalUsd: "220", slices: [
    { key: x, valueUsd: "110", percent: 50, staleness: "stale" }, { key: y, valueUsd: "110", percent: 50, staleness: "stale" },
  ] });
  expect(projectDistribution(valued, "sector")).toMatchObject({ unclassified: true, slices: [{ valueUsd: "220", percent: 100 }] });
  expect(projectDistribution(value(rows.slice(2)), "country")).toMatchObject({ totalUsd: "0", slices: [] });
  for (const quotes of [[], [{ ...quote, delayed_until: "2026-11-20T00:00:00Z" }], [{ ...quote, price_usd: "bad" }]]) {
    expect(projectSummary(value(rows, quotes))).toMatchObject({ equityUsd: "200", isEstimated: true, isAnyStale: false });
  }
  const three = value([trade(1), trade(2, { broker_id: y }), trade(3, { broker_id: y.replace(/2$/, "3") })]);
  expect(projectDistribution(three, "broker").slices.map(({ percent }) => percent)).toEqual([33.34, 33.33, 33.33]);
});
