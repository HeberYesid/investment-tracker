import { describe, expect, it } from "vitest";

import {
  aggregateHoldings,
  type AssetMeta,
  type BrokerMeta,
  type DashboardTrade,
} from "@/lib/calculations/holdings";

const ASSET_AAPL: AssetMeta = {
  id: "asset-aapl",
  ticker: "AAPL",
  name: "Apple Inc",
  sector: "Technology",
  country: "US",
};
const ASSET_NVDA: AssetMeta = {
  id: "asset-nvda",
  ticker: "NVDA",
  name: "NVIDIA Corp",
  sector: "Technology",
  country: "US",
};

const BROKER_ETORO: BrokerMeta = {
  id: "broker-etoro",
  code: "ETORO",
  name: "eToro",
};

function trade(overrides: Partial<DashboardTrade> = {}): DashboardTrade {
  return {
    asset_id: ASSET_AAPL.id,
    broker_id: BROKER_ETORO.id,
    trade_type: "BUY",
    trade_date: "",
    quantity: 0,
    price_usd: 0,
    commission_usd: 0,
    total_invested_usd: 0,
    deleted_at: null,
    ...overrides,
  };
}

describe("aggregateHoldings", () => {
  it("returns empty array when no trades are provided", () => {
    expect(aggregateHoldings([], [ASSET_AAPL], [BROKER_ETORO])).toEqual([]);
  });

  it("groups a single BUY trade into one holding", () => {
    const result = aggregateHoldings(
      [trade({ quantity: 10, price_usd: 100, commission_usd: 5, total_invested_usd: 1005 })],
      [ASSET_AAPL],
      [BROKER_ETORO],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      assetId: ASSET_AAPL.id,
      brokerId: BROKER_ETORO.id,
      ticker: "AAPL",
      brokerName: "eToro",
      quantity: 10,
      totalInvested: 1005,
      averageCost: 100.5,
      realizedPnl: 0,
      sector: "Technology",
      country: "US",
    });
  });

  it("separates holdings by broker for the same asset", () => {
    const BROKER_XTB: BrokerMeta = {
      id: "broker-xtb",
      code: "XTB",
      name: "XTB",
    };
    const result = aggregateHoldings(
      [
        trade({ quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
        trade({
          asset_id: ASSET_AAPL.id,
          broker_id: BROKER_XTB.id,
          quantity: 5,
          price_usd: 110,
          commission_usd: 0,
          total_invested_usd: 550,
        }),
      ],
      [ASSET_AAPL],
      [BROKER_ETORO, BROKER_XTB],
    );
    expect(result).toHaveLength(2);
    const tickers = result.map((r) => `${r.ticker}-${r.brokerCode}`).sort();
    expect(tickers).toEqual(["AAPL-ETORO", "AAPL-XTB"]);
  });

  it("computes realized P/L when a SELL follows a BUY", () => {
    const result = aggregateHoldings(
      [
        trade({ quantity: 10, price_usd: 100, commission_usd: 5, total_invested_usd: 1005 }),
        trade({ trade_type: "SELL", quantity: 5, price_usd: 120, commission_usd: 3, total_invested_usd: -597 }),
      ],
      [ASSET_AAPL],
      [BROKER_ETORO],
    );
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
    expect(result[0].realizedPnl).toBeCloseTo(94.5);
  });

  it("ignores soft-deleted trades", () => {
    const result = aggregateHoldings(
      [
        trade({ quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
        trade({
          quantity: 5,
          price_usd: 200,
          commission_usd: 0,
          total_invested_usd: 1000,
          deleted_at: "2025-01-01T00:00:00Z",
        }),
      ],
      [ASSET_AAPL],
      [BROKER_ETORO],
    );
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(10);
  });

  it("produces separate holdings for two different assets", () => {
    const result = aggregateHoldings(
      [
        trade({ quantity: 10, price_usd: 100, commission_usd: 0, total_invested_usd: 1000 }),
        trade({
          asset_id: ASSET_NVDA.id,
          quantity: 4,
          price_usd: 500,
          commission_usd: 0,
          total_invested_usd: 2000,
        }),
      ],
      [ASSET_AAPL, ASSET_NVDA],
      [BROKER_ETORO],
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.ticker).sort()).toEqual(["AAPL", "NVDA"]);
  });

  it("skips holdings whose asset or broker is missing in the metadata", () => {
    const result = aggregateHoldings(
      [trade({ asset_id: "unknown-asset", quantity: 1, price_usd: 1 })],
      [ASSET_AAPL],
      [BROKER_ETORO],
    );
    expect(result).toEqual([]);
  });
});
