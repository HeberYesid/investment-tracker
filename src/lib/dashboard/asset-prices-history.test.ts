import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  backfillAssetHistory,
  listActiveAssetSymbols,
  PRICE_HISTORY_SOURCE,
  type FetchYahooHistoryFn,
} from "./asset-prices-history";

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
  const methods = ["select", "eq", "is", "in", "gte", "lte", "order", "insert"];
  for (const m of methods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      spy.calls.push({ method: m, args });
      return chain;
    });
  }
  Object.defineProperty(chain, "then", {
    value: (resolve: (value: unknown) => unknown) => resolve(spy.result),
  });
  return chain;
}

const fromMock = vi.fn();

function buildClient(): SupabaseClient {
  return { from: fromMock } as unknown as SupabaseClient;
}

describe("listActiveAssetSymbols", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("deduplicates assets across multiple trades and skips missing yahoo_symbol", async () => {
    const spy = respondWith(spyChain(), {
      data: [
        {
          asset_id: "a1",
          assets: { yahoo_symbol: "AAPL", ticker: "AAPL" },
        },
        {
          asset_id: "a1",
          assets: { yahoo_symbol: "AAPL", ticker: "AAPL" },
        },
        {
          asset_id: "a2",
          assets: { yahoo_symbol: null, ticker: "MSFT" },
        },
        {
          asset_id: "a3",
          assets: { yahoo_symbol: "NVDA", ticker: "NVDA" },
        },
        {
          asset_id: "a4",
          assets: null,
        },
      ],
      error: null,
    });
    const chain = buildChainable(spy);
    fromMock.mockReturnValue(chain);

    const result = await listActiveAssetSymbols(buildClient());

    expect(result).toEqual([
      { asset_id: "a1", yahoo_symbol: "AAPL", ticker: "AAPL" },
      { asset_id: "a3", yahoo_symbol: "NVDA", ticker: "NVDA" },
    ]);
  });

  it("throws when the supabase query returns an error", async () => {
    const spy = respondWith(spyChain(), {
      data: null,
      error: { message: "boom" },
    });
    fromMock.mockReturnValue(buildChainable(spy));

    await expect(listActiveAssetSymbols(buildClient())).rejects.toThrow(
      "listActiveAssetSymbols: boom",
    );
  });
});

describe("backfillAssetHistory", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  const asset = { asset_id: "a1", yahoo_symbol: "AAPL", ticker: "AAPL" };

  function buildFetch(
    points: Array<{ observedAt: string; priceUsd: number }>,
  ): FetchYahooHistoryFn {
    return vi.fn(
      async (): Promise<{
        ok: true;
        value: Array<{ observedAt: string; priceUsd: number }>;
      }> => ({ ok: true, value: points }),
    );
  }

  it("skips the fetch when today's history gate has at least one row", async () => {
    const gateSpy = respondWith(spyChain(), { count: 1, error: null });
    const gateChain = buildChainable(gateSpy);
    fromMock.mockReturnValue(gateChain);

    const fetchYahoo = buildFetch([]);
    const result = await backfillAssetHistory(buildClient(), asset, {
      fetchYahooHistory: fetchYahoo,
    });

    expect(result).toEqual({ inserted: 0, skipped: 0 });
    expect(fetchYahoo).not.toHaveBeenCalled();
  });

  it("inserts new points and skips days that already exist", async () => {
    const gateSpy = respondWith(spyChain(), { count: 0, error: null });
    const existingSpy = respondWith(spyChain(), {
      data: [{ observed_at: "2025-02-15T20:00:00.000Z" }],
      error: null,
    });
    const insertSpy = respondWith(spyChain(), { data: null, error: null });
    const chains = [buildChainable(gateSpy), buildChainable(existingSpy), buildChainable(insertSpy)];
    fromMock.mockImplementation(
      () => chains.shift() ?? (() => { throw new Error("unexpected call"); })(),
    );

    const result = await backfillAssetHistory(buildClient(), asset, {
      fetchYahooHistory: buildFetch([
        { observedAt: "2025-02-15T20:00:00.000Z", priceUsd: 110 },
        { observedAt: "2025-02-28T20:00:00.000Z", priceUsd: 120 },
      ]),
    });

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    const insertCall = insertSpy.calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toEqual([
      {
        asset_id: "a1",
        price: 120,
        price_usd: 120,
        currency: "USD",
        source: PRICE_HISTORY_SOURCE,
        observed_at: "2025-02-28T20:00:00.000Z",
        delayed_until: null,
      },
    ]);
  });

  it("returns an error message when yahoo fetch fails", async () => {
    const gateSpy = respondWith(spyChain(), { count: 0, error: null });
    fromMock.mockReturnValue(buildChainable(gateSpy));

    const fetchYahoo: FetchYahooHistoryFn = vi.fn(
      async (): Promise<{ ok: false; error: { message: string } }> => ({
        ok: false,
        error: { message: "rate limited" },
      }),
    );
    const result = await backfillAssetHistory(buildClient(), asset, {
      fetchYahooHistory: fetchYahoo,
    });

    expect(result).toEqual({ inserted: 0, skipped: 0, message: "rate limited" });
  });
});
