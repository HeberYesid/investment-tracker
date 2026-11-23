import { describe, expect, it } from "vitest";

import { getLastCompleteMonth, prepareMonthlyPortfolioSummary, selectMonthlyTrades, valueMonthlyPortfolioSummary } from "@/lib/calculations/monthly-portfolio-summary";
import type { LedgerAsset, LedgerTrade } from "@/lib/calculations/position-ledger";

const assetId = "00000000-0000-4000-8000-000000000001";
const brokerId = "00000000-0000-4000-8000-000000000002";
const otherBrokerId = "00000000-0000-4000-8000-000000000003";
const assets = [{ id: assetId, ticker: "ABC", name: "ABC", sector: null, country: null, currency: "USD" }] satisfies Array<LedgerAsset & { currency: string }>;
const january = { startDate: "2025-01-01", endDate: "2025-01-31", openingCutoffDate: "2024-12-31" };

function trade(id: number, trade_date: string, overrides: Partial<LedgerTrade> = {}): LedgerTrade {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    asset_id: assetId,
    broker_id: brokerId,
    trade_date,
    trade_type: "BUY",
    quantity: "1",
    price_usd: "60",
    commission_usd: "0",
    deleted_at: null,
    ...overrides,
  };
}

describe("resumen mensual del portafolio", () => {
  it("delimita meses completos y cortes UTC", () => {
    const december = { startDate: "2024-12-01", endDate: "2024-12-31", openingCutoffDate: "2024-11-30" };
    expect(getLastCompleteMonth(new Date("2025-01-01T00:00:00Z"))).toEqual(december);
    for (const before of ["2025-01-31T18:59:59.999-05:00", "2025-02-01T08:59:59.999+09:00"]) {
      expect(getLastCompleteMonth(new Date(before))).toEqual(december);
    }
    for (const after of ["2025-01-31T19:00:00-05:00", "2025-02-01T09:00:00+09:00"]) {
      expect(getLastCompleteMonth(new Date(after))).toEqual(january);
    }
    expect(getLastCompleteMonth(new Date("2024-03-01T00:00:00Z"))).toEqual({
      startDate: "2024-02-01", endDate: "2024-02-29", openingCutoffDate: "2024-01-31",
    });
    expect(getLastCompleteMonth(new Date("2025-03-01T00:00:00Z"))).toEqual({
      startDate: "2025-02-01", endDate: "2025-02-28", openingCutoffDate: "2025-01-31",
    });

    const before = trade(1, "2024-12-31");
    const first = trade(2, "2025-01-01");
    const last = trade(3, "2025-01-31");
    const after = trade(4, "2025-02-01");
    expect(selectMonthlyTrades([before, first, last, after], january)).toEqual({
      openingTrades: [before], closingTrades: [before, first, last], periodTrades: [first, last], hasInvalidDate: false,
    });
  });

  it("valora con precisión por activo y bróker", () => {
    const input = prepareMonthlyPortfolioSummary([
      trade(1, "2024-12-21", { quantity: "0.12345678", commission_usd: "411" }),
      trade(2, "2024-12-22", { quantity: "0.00000001", broker_id: otherBrokerId }),
      trade(3, "2025-01-13", { trade_type: "DIVIDEND", price_usd: "50" }),
      trade(4, "2025-01-19", { trade_type: "FEE", quantity: "0", commission_usd: "38" }),
    ], assets, [], january, true);
    const price = new Map([[assetId, "100.00000001"]]);
    expect(valueMonthlyPortfolioSummary(input!, { opening: price, closing: price })).toMatchObject({
      openingValueUsd: "12.3456790012345679", closingValueUsd: "12.3456790012345679",
    });
  });

  it("distingue posiciones cerradas, historial insuficiente y libro inválido", () => {
    const buy = trade(1, "2024-12-20");
    const sell = trade(2, "2025-01-20", { trade_type: "SELL", price_usd: "800" });
    const price = new Map([[assetId, "110"]]);
    const absentPrice = new Map<string, string>();
    const summary = (trades: LedgerTrade[], closing = absentPrice) => valueMonthlyPortfolioSummary(
      prepareMonthlyPortfolioSummary(trades, assets, [], january, true)!, { opening: price, closing },
    );

    expect(summary([buy, sell])).toMatchObject({ openingValueUsd: "110", closingValueUsd: "0" });
    expect(summary([buy, { ...sell, trade_date: "2024-12-23" }])).toMatchObject({ openingValueUsd: "0", closingValueUsd: "0" });
    expect(summary([{ ...buy, trade_date: "2025-01-01" }], price)).toMatchObject({
      openingValueUsd: null, openingReason: "NO_HISTORY", closingValueUsd: "110",
    });
    expect(prepareMonthlyPortfolioSummary([trade(3, "2025-02-01"), { ...buy, deleted_at: "2025-01-22" }], assets, [], january, true)).toBeNull();
    expect(summary([buy, { ...sell, quantity: "2" }], price)).toMatchObject({
      openingValueUsd: "110", closingValueUsd: null, closingReason: "INVALID_LEDGER",
    });
    expect(summary([buy, { ...sell, trade_date: "2025-02-30" }], price)).toMatchObject({
      openingValueUsd: null, openingReason: "INVALID_LEDGER", closingValueUsd: null, closingReason: "INVALID_LEDGER",
    });
    expect(summary([buy, { ...sell, trade_date: "2025-02-01", quantity: "2" }], price)).toMatchObject({
      openingValueUsd: "110", closingValueUsd: "110",
    });
  });

  it("distingue la moneda del activo de la del bróker o la operación", () => {
    const otherAssetId = "00000000-0000-4000-8000-000000000004";
    const usdBuy = { ...trade(1, "2024-12-20"), currency_original: "COP" };
    const otherBuy = trade(2, "2025-01-15", { asset_id: otherAssetId });
    const closing = new Map([[assetId, "110"], [otherAssetId, "180"]]);
    const opening = new Map([[assetId, "100"]]);
    const brokers = [{ id: brokerId, code: "COP", name: "Bróker COP", currency: "COP" }];
    for (const currency of ["COP", null, undefined]) {
      const catalog = [...assets, { ...assets[0], id: otherAssetId, currency }];
      const input = prepareMonthlyPortfolioSummary([usdBuy, otherBuy], catalog, brokers, january, true)!;
      expect(valueMonthlyPortfolioSummary(input, { opening, closing })).toMatchObject({
        openingValueUsd: "100", closingValueUsd: null, closingReason: "UNSUPPORTED_CURRENCY", changeUsd: null, activity: { BUY: 1 },
      });
      const sell = trade(3, "2025-01-20", { asset_id: otherAssetId, trade_type: "SELL" });
      const closed = prepareMonthlyPortfolioSummary([usdBuy, otherBuy, sell], catalog, brokers, january, true)!;
      expect(valueMonthlyPortfolioSummary(closed, { opening, closing })).toMatchObject({
        openingValueUsd: "100", closingValueUsd: "110",
      });
    }
  });

  it("calcula cambio firmado con compra o sin operaciones", () => {
    const initial = trade(1, "2024-12-20", { quantity: "10" });
    const buy = trade(2, "2025-01-01", { quantity: "2" });
    const value = (trades: LedgerTrade[], closingPrice?: string) => valueMonthlyPortfolioSummary(
      prepareMonthlyPortfolioSummary(trades, assets, [], january, true)!,
      { opening: new Map([[assetId, "100"]]), closing: new Map(closingPrice ? [[assetId, closingPrice]] : []) },
    );
    expect(value([initial, buy], "110")).toMatchObject({
      openingValueUsd: "1000", closingValueUsd: "1320", changeUsd: "320", activity: { BUY: 1 },
    });
    expect(value([initial], "90")).toMatchObject({
      openingValueUsd: "1000", closingValueUsd: "900", changeUsd: "-100",
      activity: { BUY: 0, SELL: 0, TRANSFER_IN: 0, TRANSFER_OUT: 0, DIVIDEND: 0, FEE: 0 },
    });
    expect(value([initial], "100").changeUsd).toBe("0");
    expect(value([initial], "100.00000001").changeUsd).toBe("0.0000001");
    expect(value([initial])).toMatchObject({ openingValueUsd: "1000", closingValueUsd: null, changeUsd: null });
  });

  it("cuenta los seis tipos vigentes sin inferir efectivo", () => {
    const initial = trade(1, "2024-12-31");
    const activityRows = [
      trade(2, "2025-01-01"),
      trade(3, "2025-01-06", { trade_type: "TRANSFER_IN" }),
      trade(4, "2025-01-11", { trade_type: "TRANSFER_OUT" }),
      trade(5, "2025-01-16", { trade_type: "DIVIDEND" }),
      trade(6, "2025-01-21", { trade_type: "FEE", quantity: "0" }),
      trade(7, "2025-01-31", { trade_type: "SELL", quantity: "inválida" }),
      trade(8, "2025-01-31", { deleted_at: "2025-02-01" }),
    ];
    const rows = [initial, ...activityRows];
    const history = new Map([[assetId, "100"]]);
    const value = (trades: LedgerTrade[], complete = true) => valueMonthlyPortfolioSummary(
      prepareMonthlyPortfolioSummary(trades, assets, [], january, complete)!, { opening: history, closing: history },
    );
    const counts = { BUY: 1, SELL: 1, TRANSFER_IN: 1, TRANSFER_OUT: 1, DIVIDEND: 1, FEE: 1 };
    expect(value(rows)).toMatchObject({ openingValueUsd: "100", closingValueUsd: null, activity: counts });
    expect(Object.keys(value(rows).activity ?? {}).sort()).toEqual(Object.keys(counts).sort());
    expect(value(rows, false)).toMatchObject({
      openingValueUsd: null, closingValueUsd: null, changeUsd: null, activity: null, activityReason: "INCOMPLETE_TRADES",
    });
    for (const row of [trade(9, "2025-02-30"), trade(9, "2025-01-19", { trade_type: "DESCONOCIDO" })]) {
      expect(value([...rows, row])).toMatchObject({ activity: null, activityReason: "UNCLASSIFIABLE_ACTIVITY" });
    }
    expect(value([...rows, trade(9, "2025-02-01", { trade_type: "DESCONOCIDO" })]).activity).toEqual(counts);
  });
});
