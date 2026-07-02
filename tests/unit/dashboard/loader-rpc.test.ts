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
  return { calls: [], result: Promise.resolve({ data: [], error: null }) };
}

function respondWith<T>(spy: ChainSpy, value: T): ChainSpy {
  spy.result = Promise.resolve(value);
  return spy;
}

function buildChainable(spy: ChainSpy): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "is", "in", "gte", "lte", "order"];
  for (const m of methods) {
    chain[m] = vi.fn(() => {
      spy.calls.push({ method: m, args: [] });
      return chain;
    });
  }
  Object.defineProperty(chain, "then", {
    value: (resolve: (value: unknown) => unknown) => resolve(spy.result),
  });
  return chain;
}

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => ({ rpc: rpcMock, from: fromMock }),
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

import { loadDashboardData } from "@/lib/dashboard/loader";

const PORTFOLIO_ID = "p1";

describe("loadDashboardData - get_latest_market_prices RPC", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invokes the RPC with the trade asset ids and maps rows to numeric prices", async () => {
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
        {
          asset_id: "a2",
          broker_id: "b1",
          trade_type: "BUY",
          trade_date: "2025-02-12",
          quantity: 5,
          price_usd: 200,
          commission_usd: 0,
          total_invested_usd: 1000,
          deleted_at: null,
          assets: { ticker: "NVDA", name: "Nvidia", sector: null, country: null },
          brokers: { code: "ETORO", name: "eToro" },
        },
      ],
      error: null,
    });
    const tradesChain = buildChainable(tradesSpy);
    const historyChain = buildChainable(spyChain());

    fromMock.mockImplementation((table: string) => {
      if (table === "trades") return tradesChain;
      if (table === "market_prices") return historyChain;
      throw new Error(`unexpected table: ${table}`);
    });

    rpcMock.mockResolvedValueOnce({
      data: [
        {
          asset_id: "a1",
          price_usd: "150.5",
          observed_at: "2026-06-15T11:00:00.000Z",
          delayed_until: null,
        },
        {
          asset_id: "a2",
          price_usd: "900.25",
          observed_at: "2026-06-15T11:00:00.000Z",
          delayed_until: null,
        },
      ],
      error: null,
    });

    const userSupabase = { from: fromMock } as unknown as SupabaseClient;
    const data = await loadDashboardData(PORTFOLIO_ID, userSupabase);

    expect(rpcMock).toHaveBeenCalledWith("get_latest_market_prices", {
      p_asset_ids: ["a1", "a2"],
    });
    expect(data.latestMarketPrices).toEqual([
      {
        asset_id: "a1",
        price_usd: 150.5,
        observed_at: "2026-06-15T11:00:00.000Z",
        delayed_until: null,
      },
      {
        asset_id: "a2",
        price_usd: 900.25,
        observed_at: "2026-06-15T11:00:00.000Z",
        delayed_until: null,
      },
    ]);
  });

  it("throws when the RPC returns an error", async () => {
    const tradesSpy = respondWith(spyChain(), {
      data: [
        {
          asset_id: "a1",
          broker_id: "b1",
          trade_type: "BUY",
          trade_date: "2025-02-10",
          quantity: 1,
          price_usd: 100,
          commission_usd: 0,
          total_invested_usd: 100,
          deleted_at: null,
          assets: { ticker: "AAPL", name: null, sector: null, country: null },
          brokers: { code: "ETORO", name: "eToro" },
        },
      ],
      error: null,
    });
    const tradesChain = buildChainable(tradesSpy);
    const historyChain = buildChainable(spyChain());
    fromMock.mockImplementation((table: string) => {
      if (table === "trades") return tradesChain;
      if (table === "market_prices") return historyChain;
      throw new Error(`unexpected table: ${table}`);
    });

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "rpc exploded" },
    });

    const userSupabase = { from: fromMock } as unknown as SupabaseClient;
    await expect(loadDashboardData(PORTFOLIO_ID, userSupabase)).rejects.toThrow(
      "rpc exploded",
    );
  });

  it("returns an empty list when there are no asset ids", async () => {
    const tradesSpy = respondWith(spyChain(), { data: [], error: null });
    const tradesChain = buildChainable(tradesSpy);
    const historyChain = buildChainable(spyChain());
    fromMock.mockImplementation((table: string) => {
      if (table === "trades") return tradesChain;
      if (table === "market_prices") return historyChain;
      throw new Error(`unexpected table: ${table}`);
    });

    const userSupabase = { from: fromMock } as unknown as SupabaseClient;
    const data = await loadDashboardData(PORTFOLIO_ID, userSupabase);

    expect(rpcMock).not.toHaveBeenCalled();
    expect(data.latestMarketPrices).toEqual([]);
  });
});
