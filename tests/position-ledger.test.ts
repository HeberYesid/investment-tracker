import { describe, expect, it } from "vitest";
import { buildPositionLedger, type LedgerTrade } from "@/lib/calculations/position-ledger";

const asset = "30000000-0000-4000-8000-000000000001";
const broker = "40000000-0000-4000-8000-000000000001";
const trade = (id: number, overrides: Partial<LedgerTrade> = {}): LedgerTrade => ({
  id: `50000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  asset_id: asset, broker_id: broker, trade_date: "2025-01-10", trade_type: "BUY",
  quantity: "2", price_usd: "100", commission_usd: "0", deleted_at: null, ...overrides,
});
const build = (trades: LedgerTrade[]) => buildPositionLedger(trades, [], []);

describe("libro de posiciones", () => {
  it("libro_cronologico_independiente_de_lectura", () => {
    const buy = trade(1);
    const sell = trade(2, { trade_date: "2025-01-11", trade_type: "SELL", quantity: "1", price_usd: "120" });
    const deleted = { ...sell, deleted_at: "2025-01-12T00:00:00Z" };
    const ordered = build([buy, sell, deleted]);
    const reversed = [deleted, sell, buy];
    expect(build(reversed)).toEqual(ordered);
    expect(reversed).toEqual([deleted, sell, buy]);
    expect(ordered.positions).toMatchObject([{ assetId: asset, brokerId: broker,
      balance: { quantity: 100_000_000n, cost: 100n * 10n ** 24n, realized: 20n * 10n ** 24n } }]);
  });

  it("empates_inocuos_no_cambian_importes", () => {
    const sell = trade(2, { trade_date: "2025-01-11", trade_type: "SELL", quantity: "0.5", price_usd: "120" });
    const transfer = trade(3, { trade_date: "2025-01-11", trade_type: "TRANSFER_OUT", quantity: "0.75" });
    const first = build([trade(1), sell, transfer]);
    const renumbered = build([{ ...transfer, id: sell.id }, { ...sell, id: transfer.id }, trade(1)]);
    expect(first).toEqual(renumbered);
    expect(first.positions).toMatchObject([{ balance: {
      quantity: 75_000_000n, cost: 75n * 10n ** 24n, realized: 10n * 10n ** 24n,
    } }]);
  });

  it("no_concilia_dia_sensible_sin_hora", () => {
    const day = "2025-01-11";
    const starting = trade(1, { quantity: "1" });
    const buy = trade(2, { trade_date: day, quantity: "1", price_usd: "200" });
    const sell = trade(3, { trade_date: day, trade_type: "SELL", quantity: "1", price_usd: "120" });
    const fee = trade(4, { trade_date: day, trade_type: "FEE", commission_usd: "2", quantity: "0" });
    for (const rows of [[starting, buy, sell], [starting, sell, fee], [buy, fee]]) {
      const result = build(rows);
      expect(result.positions).toMatchObject([{ balance: null, issue: { code: "AMBIGUOUS_DAY_ORDER", tradeDate: day } }]);
      expect(build([...rows].reverse())).toEqual(result);
    }
  });

  it("inventario_insuficiente_y_filas_invalidas", () => {
    const day = "2025-01-11";
    const buy = trade(1, { trade_date: day, quantity: "1" });
    const sell = trade(2, { trade_date: day, trade_type: "SELL", quantity: "1.00000001" });
    const otherBroker = "40000000-0000-4000-8000-000000000002";
    const otherAsset = "30000000-0000-4000-8000-000000000002";
    const result = build([sell, buy, trade(3, { broker_id: otherBroker }), trade(4, { asset_id: otherAsset })]);
    expect(result.positions.find((row) => row.assetId === asset && row.brokerId === broker)).toMatchObject({
      balance: null, issue: { code: "INSUFFICIENT_QUANTITY", tradeDate: day },
    });
    expect(result.positions.filter(({ balance }) => balance !== null)).toHaveLength(2);
    for (const invalid of [{ id: "x" }, { quantity: "0" }, { quantity: "1.000000001" },
      { price_usd: "-1" }, { commission_usd: "" }, { trade_type: "OTHER" }, { trade_date: "2025-02-29" }]) {
      expect(build([trade(5, invalid)]).positions).toMatchObject([{ balance: null, issue: { code: "INVALID_TRADE" } }]);
    }
    expect(build([buy, { ...buy, broker_id: otherBroker }]).positions).toMatchObject([
      { balance: null, issue: { code: "INVALID_TRADE" } }, { balance: null, issue: { code: "INVALID_TRADE" } },
    ]);
    expect(build([buy, trade(6, { broker_id: "no-fiable" })])).toMatchObject({
      portfolioIssue: { code: "INVALID_TRADE", tradeDate: null },
    });
  });

  it("costo_fraccional_con_comisiones", () => {
    const rows = [trade(1, { quantity: "0.5", commission_usd: "2" }), trade(2, {
      trade_date: "2025-01-11", trade_type: "SELL", quantity: "0.125", price_usd: "120", commission_usd: "1",
    })];
    expect(build(rows).positions[0].balance).toEqual({ quantity: 37_500_000n, cost: 39n * 10n ** 24n, realized: 10n ** 24n });
  });

  it("fee_con_cantidad_positiva_invalida_la_pareja", () => {
    const fee = trade(1, { trade_type: "FEE", quantity: "1", price_usd: "0", commission_usd: "2" });
    expect(build([fee]).positions).toMatchObject([{ assetId: asset, brokerId: broker, balance: null,
      issue: { code: "INVALID_TRADE", tradeDate: "2025-01-10" } }]);
  });

  it("dividendo_y_fee_segun_saldo", () => {
    const buy = trade(1, { quantity: "1" });
    const sell = trade(2, { trade_date: "2025-01-11", trade_type: "SELL", quantity: "1", price_usd: "120" });
    const closedFee = trade(3, { trade_date: "2025-01-12", trade_type: "FEE", quantity: "0", commission_usd: "2" });
    expect(build([buy, sell, closedFee]).positions[0].balance).toEqual({ quantity: 0n, cost: 0n, realized: 18n * 10n ** 24n });
    const openFee = { ...closedFee, trade_date: "2025-01-11" };
    const dividend = trade(4, { trade_date: "2025-01-11", trade_type: "DIVIDEND", quantity: "1", price_usd: "5", commission_usd: "1" });
    expect(build([buy, openFee, dividend]).positions[0].balance).toEqual({ quantity: 100_000_000n, cost: 102n * 10n ** 24n, realized: 5n * 10n ** 24n });
  });

  it("transferencia_cierre_y_reapertura", () => {
    const buy = trade(1, { trade_type: "TRANSFER_IN", quantity: "3", price_usd: "0", commission_usd: "0.01" });
    const fee = trade(2, { trade_date: "2025-01-11", trade_type: "FEE", quantity: "0", commission_usd: "1" });
    const sell = trade(3, { trade_date: "2025-01-12", trade_type: "SELL", quantity: "1", price_usd: "0" });
    const transfer = trade(4, { trade_date: "2025-01-12", trade_type: "TRANSFER_OUT", quantity: "2", commission_usd: "7" });
    const closed = [buy, fee, sell, transfer];
    const realized = -333_333_333_333_333_333_333_333n;
    expect(build(closed).positions[0].balance).toEqual({ quantity: 0n, cost: 0n, realized });
    expect(build([...closed, trade(5, { trade_date: "2025-01-13", quantity: "0.00000001", price_usd: "0.00000001" })]).positions[0].balance)
      .toEqual({ quantity: 1n, cost: 100_000_000n, realized });
  });
});
