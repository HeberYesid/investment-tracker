import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

interface CallRecord {
  method: string;
  args: unknown[];
}

interface ChainSpy {
  calls: CallRecord[];
  result: Promise<unknown>;
}

function spyChain(): ChainSpy {
  return {
    calls: [],
    result: Promise.resolve({ data: [], error: null }),
  };
}

function respondWith<T>(spy: ChainSpy, value: T): ChainSpy {
  spy.result = Promise.resolve(value);
  return spy;
}

function buildChainable(spy: ChainSpy): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "is", "in", "gte", "lte", "order"];
  for (const m of methods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      spy.calls.push({ method: m, args });
      if (m === "is" || m === "order") {
        return spy.result;
      }
      return chain;
    });
  }
  return chain;
}

function findCall(spy: ChainSpy, method: string): CallRecord | undefined {
  return spy.calls.find((c) => c.method === method);
}

const rpcMock = vi.fn();
const fromMock = vi.fn();
const serviceSupabase = {
  rpc: rpcMock,
  from: fromMock,
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => serviceSupabase,
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

import { loadDashboardData } from "./loader";

const PORTFOLIO_ID = "p1";

describe("loadDashboardData - historical prices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries market_prices with source=PRICE_HISTORY for the trade assets", async () => {
    const tradesSpy = respondWith(spyChain(), {
      data: [
        {
          asset_id: "a1",
          broker_id: "b1",
          trade_type: "BUY",
          trade_date: "2025-02-10",
          quantity: 10,
          price_usd: 100,
          commission_usd: 0,
          total_invested_usd: 1000,
          deleted_at: null,
          assets: { ticker: "AAPL", name: "Apple", sector: null, country: null },
          brokers: { code: "ETORO", name: "eToro" },
        },
      ],
      error: null,
    });
    const tradesChain = buildChainable(tradesSpy);

    const historySpy = respondWith(spyChain(), {
      data: [
        { asset_id: "a1", price_usd: 110, observed_at: "2025-02-28T20:00:00.000Z" },
        { asset_id: "a1", price_usd: 115, observed_at: "2025-03-31T20:00:00.000Z" },
      ],
      error: null,
    });
    const historyChain = buildChainable(historySpy);

    fromMock.mockImplementation((table: string) => {
      if (table === "trades") return tradesChain;
      if (table === "market_prices") return historyChain;
      throw new Error(`unexpected table: ${table}`);
    });

    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: [], error: null }),
    );

    const userSupabase = { from: fromMock } as unknown as SupabaseClient;
    const data = await loadDashboardData(PORTFOLIO_ID, userSupabase);

    expect(findCall(historySpy, "eq")?.args).toEqual(["source", "PRICE_HISTORY"]);
    expect(findCall(historySpy, "in")?.args).toEqual(["asset_id", ["a1"]]);
    expect(findCall(historySpy, "gte")?.args).toEqual([
      "observed_at",
      "2025-02-10",
    ]);
    expect(findCall(historySpy, "lte")?.args).toEqual([
      "observed_at",
      "2026-06-15T23:59:59.999Z",
    ]);
    expect(findCall(historySpy, "order")?.args).toEqual([
      "observed_at",
      { ascending: true },
    ]);
    expect(data.historicalPrices).toEqual([
      { asset_id: "a1", price_usd: 110, observed_at: "2025-02-28T20:00:00.000Z" },
      { asset_id: "a1", price_usd: 115, observed_at: "2025-03-31T20:00:00.000Z" },
    ]);
  });

  it("skips the historical prices query when there are no trades", async () => {
    const tradesSpy = respondWith(spyChain(), { data: [], error: null });
    const tradesChain = buildChainable(tradesSpy);

    const historySpy = spyChain();
    const historyChain = buildChainable(historySpy);

    fromMock.mockImplementation((table: string) => {
      if (table === "trades") return tradesChain;
      if (table === "market_prices") return historyChain;
      throw new Error(`unexpected table: ${table}`);
    });

    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: [], error: null }),
    );

    const userSupabase = { from: fromMock } as unknown as SupabaseClient;
    const data = await loadDashboardData(PORTFOLIO_ID, userSupabase);
    expect(historySpy.calls).toHaveLength(0);
    expect(data.historicalPrices).toEqual([]);
  });
});
