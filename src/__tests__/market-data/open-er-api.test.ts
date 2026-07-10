import { describe, expect, it, vi } from "vitest";

import {
  createOpenErApiFxProvider,
  pickFxRate,
} from "@/lib/market-data/open-er-api";
import type { FetchLike } from "@/lib/market-data/types";
import { getMarketDataEnv } from "@/lib/market-data/config";

type FetchResponse = Awaited<ReturnType<FetchLike>>;

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    headers: {
      get: (_name: string) => null,
    },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function fxFixture(opts: { copPerUsd: number; ts?: number }) {
  return {
    result: "success",
    base_code: "USD",
    time_last_update_unix: opts.ts ?? 1_716_000_000,
    rates: {
      USD: 1,
      COP: opts.copPerUsd,
      EUR: 0.92,
    },
  };
}

describe("createOpenErApiFxProvider.fetchLatestRates", () => {
  it("hits the configured base URL and returns USD/COP pairs", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(fxFixture({ copPerUsd: 4000 })),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });

    const rates = await provider.fetchLatestRates();

    const called = String(fetchImpl.mock.calls[0]?.[0]);
    expect(called).toBe("https://open.er-api.com/v6/latest/USD");

    expect(rates).toHaveLength(3);
    const usdToCop = rates.find(
      (r) => r.fromCurrency === "USD" && r.toCurrency === "COP",
    );
    const copToUsd = rates.find(
      (r) => r.fromCurrency === "COP" && r.toCurrency === "USD",
    );
    expect(usdToCop?.rate).toBe(4000);
    expect(copToUsd?.rate).toBe(0.00025);
    expect(rates[0].rate).toBe(1);
    expect(rates[0].observedAt).toBe(
      new Date(1_716_000_000 * 1000).toISOString(),
    );
  });

  it("rejects when the response is not success", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({ result: "error", rates: {} }),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    await expect(provider.fetchLatestRates()).rejects.toMatchObject({
      code: "PERMANENT",
    });
  });

  it("rejects when COP is missing or non-positive", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        result: "success",
        base_code: "USD",
        time_last_update_unix: 1_716_000_000,
        rates: { USD: 1, EUR: 0.92 },
      }),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    await expect(provider.fetchLatestRates()).rejects.toMatchObject({
      code: "PERMANENT",
    });
  });

  it("rejects when USD is not equal to 1", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({
        result: "success",
        base_code: "USD",
        time_last_update_unix: 1_716_000_000,
        rates: { USD: 1.5, COP: 4000 },
      }),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    await expect(provider.fetchLatestRates()).rejects.toMatchObject({
      code: "PERMANENT",
    });
  });

  it("classifies 429 as RATE_LIMITED", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse({}, 429),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    await expect(provider.fetchLatestRates()).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("wraps network failures as TRANSIENT", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error("offline"));
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    await expect(provider.fetchLatestRates()).rejects.toMatchObject({
      code: "TRANSIENT",
    });
  });
});

describe("pickFxRate", () => {
  it("returns the matching pair or null", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(fxFixture({ copPerUsd: 4000 })),
    );
    const provider = createOpenErApiFxProvider({
      fetchImpl,
      env: getMarketDataEnv(),
    });
    const rates = await provider.fetchLatestRates();
    expect(pickFxRate(rates, "USD", "COP")?.rate).toBe(4000);
    expect(pickFxRate(rates, "COP", "USD")?.rate).toBe(0.00025);
    expect(pickFxRate(rates, "USD", "USD")?.rate).toBe(1);
    expect(pickFxRate(rates, "COP", "COP")).toBeNull();
  });
});
