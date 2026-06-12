import { describe, it, expect } from "vitest";
import {
  calculatePosition,
  calculateUnrealizedPnl,
  calculateReturnPct,
  calculatePortfolioTotalInvested,
  type TradeRow,
} from "@/lib/calculations/positions";

function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    trade_type: "BUY",
    quantity: 0,
    price_usd: 0,
    commission_usd: 0,
    total_invested_usd: 0,
    deleted_at: null,
    ...overrides,
  };
}

describe("calculatePosition", () => {
  it("BUY trade increases quantity and cost basis", () => {
    const trades = [makeTrade({ trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 5, total_invested_usd: 1005 })];
    const pos = calculatePosition(trades);
    expect(pos.quantity).toBe(10);
    expect(pos.totalInvested).toBe(1005);
    expect(pos.averageCost).toBeCloseTo(100.5);
    expect(pos.realizedPnl).toBe(0);
  });

  it("SELL trade reduces quantity and computes realized P/L", () => {
    const trades = [
      makeTrade({ trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 5, total_invested_usd: 1005 }),
      makeTrade({ trade_type: "SELL", quantity: 5, price_usd: 120, commission_usd: 3, total_invested_usd: -597 }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.quantity).toBe(5);
    expect(pos.realizedPnl).toBeCloseTo(94.5);
  });

  it("soft-deleted trades are excluded from calculations", () => {
    const trades = [
      makeTrade({ trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
      makeTrade({ trade_type: "BUY", quantity: 5, price_usd: 200, commission_usd: 0, total_invested_usd: 1000, deleted_at: "2025-01-01T00:00:00Z" }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.quantity).toBe(10);
    expect(pos.totalInvested).toBe(1000);
  });

  it("empty trades array returns zeros", () => {
    const pos = calculatePosition([]);
    expect(pos.quantity).toBe(0);
    expect(pos.averageCost).toBe(0);
    expect(pos.totalInvested).toBe(0);
    expect(pos.realizedPnl).toBe(0);
  });

  it("DIVIDEND adds to realized P/L", () => {
    const trades = [
      makeTrade({ trade_type: "BUY", quantity: 50, price_usd: 10, commission_usd: 0, total_invested_usd: 500 }),
      makeTrade({ trade_type: "DIVIDEND", quantity: 50, price_usd: 0.5, commission_usd: 0, total_invested_usd: -25 }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.realizedPnl).toBeCloseTo(25);
    expect(pos.quantity).toBe(50);
  });

  it("FEE increases cost basis", () => {
    const trades = [
      makeTrade({ trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
      makeTrade({ trade_type: "FEE", quantity: 0, price_usd: 0, commission_usd: 10, total_invested_usd: 10 }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.totalInvested).toBe(1010);
    expect(pos.quantity).toBe(10);
  });

  it("TRANSFER_IN adds quantity and cost basis", () => {
    const trades = [
      makeTrade({ trade_type: "TRANSFER_IN", quantity: 20, price_usd: 50, commission_usd: 0, total_invested_usd: 1000 }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.quantity).toBe(20);
    expect(pos.totalInvested).toBe(1000);
    expect(pos.averageCost).toBeCloseTo(50);
  });

  it("TRANSFER_OUT reduces quantity and cost basis proportionally", () => {
    const trades = [
      makeTrade({ trade_type: "BUY", quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
      makeTrade({ trade_type: "TRANSFER_OUT", quantity: 4, price_usd: 100, commission_usd: 0, total_invested_usd: -400 }),
    ];
    const pos = calculatePosition(trades);
    expect(pos.quantity).toBe(6);
    expect(pos.totalInvested).toBeCloseTo(600);
  });
});

describe("calculateUnrealizedPnl", () => {
  it("computes unrealized P/L for profitable position", () => {
    expect(calculateUnrealizedPnl(10, 100, 120)).toBe(200);
  });

  it("computes unrealized P/L for losing position", () => {
    expect(calculateUnrealizedPnl(10, 100, 80)).toBe(-200);
  });

  it("returns zero when price equals cost", () => {
    expect(calculateUnrealizedPnl(10, 100, 100)).toBe(0);
  });
});

describe("calculateReturnPct", () => {
  it("computes return percentage correctly", () => {
    expect(calculateReturnPct(1000, 1200, 50)).toBeCloseTo(25);
  });

  it("returns zero when totalInvested is zero", () => {
    expect(calculateReturnPct(0, 1200, 50)).toBe(0);
  });

  it("returns zero when totalInvested is negative", () => {
    expect(calculateReturnPct(-100, 1200, 50)).toBe(0);
  });

  it("computes negative return", () => {
    expect(calculateReturnPct(1000, 800, 0)).toBeCloseTo(-20);
  });
});

describe("calculatePortfolioTotalInvested", () => {
  it("sums total_invested_usd for active trades only", () => {
    const trades = [
      makeTrade({ total_invested_usd: 1000 }),
      makeTrade({ total_invested_usd: 500 }),
      makeTrade({ total_invested_usd: 300, deleted_at: "2025-01-01T00:00:00Z" }),
    ];
    expect(calculatePortfolioTotalInvested(trades)).toBe(1500);
  });

  it("returns zero for empty array", () => {
    expect(calculatePortfolioTotalInvested([])).toBe(0);
  });
});
