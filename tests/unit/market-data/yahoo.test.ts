import { describe, expect, it, vi } from "vitest";

import { createYahooProvider, toProviderError } from "@/lib/market-data/yahoo";
import type { FetchLike } from "@/lib/market-data/types";
import { getMarketDataEnv } from "@/lib/market-data/config";

type FetchResponse = Awaited<ReturnType<FetchLike>>;

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function chartFixture(opts: {
  price: number;
  ts?: number;
  currency?: string;
  symbol?: string;
}) {
  const ts = opts.ts ?? 1_700_000_000;
  return {
    chart: {
      result: [
        {
          meta: {
            currency: opts.currency ?? "USD",
            symbol: opts.symbol ?? "AAPL",
            regularMarketPrice: opts.price,
            regularMarketTime: ts,
            previousClose: opts.price - 1,
          },
          timestamp: [ts],
          indicators: {
            adjclose: [{ adjclose: [opts.price] }],
          },
        },
      ],
      error: null,
    },
  };
}

describe("createYahooProvider.fetchQuotes", () => {
  it("calls the chart endpoint with the symbol and 1d range", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(chartFixture({ price: 175.43, symbol: "AAPL" })),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });

    const quotes = await provider.fetchQuotes(["AAPL"]);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe("AAPL");
    expect(quotes[0].priceUsd).toBe(175.43);
    expect(quotes[0].currency).toBe("USD");
    expect(quotes[0].observedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(quotes[0].delayedUntil).toBeNull();

    const called = fetchImpl.mock.calls[0]?.[0] as string;
    expect(called).toContain("/v8/finance/chart/AAPL");
    expect(called).toContain("range=1d");
    expect(called).toContain("interval=1d");
  });

  it("falls back to delayedPrice when regularMarketPrice is missing", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: {
                currency: "USD",
                symbol: "BRK.B",
                delayedPrice: 420.55,
                delayedPriceTime: 1_700_000_500,
              },
              timestamp: [],
              indicators: {},
            },
          ],
          error: null,
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });
    const quotes = await provider.fetchQuotes(["BRK.B"]);
    expect(quotes[0].priceUsd).toBe(420.55);
  });

  it("skips symbols with errors and returns the successful ones", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("AAPL")) {
        return jsonResponse(chartFixture({ price: 100, symbol: "AAPL" }));
      }
      if (u.includes("NOPE")) {
        return jsonResponse(
          { chart: { result: [], error: { description: "Not Found" } } },
          404,
        );
      }
      throw new Error("unexpected url");
    });
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });

    const quotes = await provider.fetchQuotes(["AAPL", "NOPE"]);

    expect(quotes.map((q) => q.symbol)).toEqual(["AAPL"]);
  });

  it("classifies 429 as RATE_LIMITED but still skips that symbol", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({}, 429),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });
    const quotes = await provider.fetchQuotes(["AAPL"]);
    expect(quotes).toEqual([]);
  });
});

describe("createYahooProvider.fetchHistory", () => {
  it("returns points derived from adjclose and timestamps", async () => {
    const ts = [1_700_000_000, 1_700_086_400, 1_700_172_800];
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: { currency: "USD", symbol: "SPY" },
              timestamp: ts,
              indicators: {
                adjclose: [{ adjclose: [100, 101.5, 102.25] }],
              },
            },
          ],
          error: null,
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });
    const history = await provider.fetchHistory("SPY", "1mo");
    expect(history.symbol).toBe("SPY");
    expect(history.points).toEqual([
      { date: new Date(ts[0] * 1000).toISOString(), value: 100 },
      { date: new Date(ts[1] * 1000).toISOString(), value: 101.5 },
      { date: new Date(ts[2] * 1000).toISOString(), value: 102.25 },
    ]);
    expect(String((fetchImpl.mock.calls[0]?.[0] as string))).toContain(
      "range=1mo",
    );
  });

  it("drops nulls in the adjclose series", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: { currency: "USD", symbol: "QQQ" },
              timestamp: [1_700_000_000, 1_700_086_400, 1_700_172_800],
              indicators: {
                adjclose: [{ adjclose: [50, null, 51.25] }],
              },
            },
          ],
          error: null,
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });
    const history = await provider.fetchHistory("QQQ", "3mo");
    expect(history.points).toHaveLength(2);
    expect(history.points[0].value).toBe(50);
    expect(history.points[1].value).toBe(51.25);
  });

  it("throws PERMANENT when adjclose is empty", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: { currency: "USD", symbol: "EMPTY" },
              timestamp: [1_700_000_000],
              indicators: { adjclose: [{ adjclose: [null] }] },
            },
          ],
          error: null,
        },
      }),
    );
    const provider = createYahooProvider({ fetchImpl, env: getMarketDataEnv() });
    await expect(provider.fetchHistory("EMPTY", "1y")).rejects.toMatchObject({
      code: "PERMANENT",
    });
  });
});

describe("toProviderError", () => {
  it("returns the same object when given a PriceProviderError", () => {
    const err = { code: "TRANSIENT" as const, message: "boom" };
    expect(toProviderError(err)).toBe(err);
  });

  it("wraps unknown errors in TRANSIENT", () => {
    const err = toProviderError(new Error("nope"));
    expect(err.code).toBe("TRANSIENT");
    expect(err.cause).toBeInstanceOf(Error);
  });
});
