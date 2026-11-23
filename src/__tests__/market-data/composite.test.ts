import { expect, it, vi } from "vitest";
import { createCompositeProvider } from "@/lib/market-data/composite";
import { getPriceProvider, resetPriceProviderForTests } from "@/lib/market-data/registry";

const quote = (symbol: string) => ({ symbol, priceUsd: 123, currency: "USD", observedAt: "2026-06-17T21:00:00Z", delayedUntil: null });
const error = { code: "RATE_LIMITED", message: "Yahoo 429" };
const provider = (fetchQuote: (symbol: string) => Promise<ReturnType<typeof quote>>) => ({ fetchQuote, fetchQuotes: vi.fn(), fetchHistory: vi.fn() });

it("suple únicamente los símbolos fallidos y conserva la fuente", async () => {
  const yahoo = provider(async (symbol) => { if (symbol === "AAPL") throw error; return quote(symbol); });
  const stooq = provider(vi.fn(async () => quote("AAPL.US")));
  const result = await createCompositeProvider([yahoo, stooq]).fetchQuotesWithBreakdown(["MSFT", "AAPL"]);
  expect(stooq.fetchQuote).toHaveBeenCalledExactlyOnceWith("AAPL");
  expect(result).toEqual({
    quotes: [{ ...quote("MSFT"), source: "YAHOO" }, { ...quote("AAPL"), source: "STOOQ" }],
    yahooOk: 1, stooqFallback: 1, failures: [],
  });
});

it("conserva el error principal cuando fracasan ambos proveedores", async () => {
  const composite = createCompositeProvider([
    provider(async () => { throw error; }),
    provider(async () => { throw new Error("Stooq fuera de servicio"); }),
  ]);
  await expect(composite.fetchQuote("AAPL")).rejects.toBe(error);
  expect((await composite.fetchQuotesWithBreakdown(["AAPL"])).failures).toEqual([{ symbol: "AAPL", error }]);
});

it("el registro activo solo consulta Yahoo y se puede reiniciar", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("Fallo simulado de red"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MARKET_DATA_YAHOO_BASE_URL", "https://yahoo.fixture.invalid");
  resetPriceProviderForTests();
  try {
    const first = getPriceProvider();
    await expect(first.fetchQuotes(["AAPL"])).resolves.toEqual([]);
    expect(new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname))).toEqual(new Set(["yahoo.fixture.invalid"]));
    expect(getPriceProvider()).toBe(first);
    resetPriceProviderForTests();
    expect(getPriceProvider()).not.toBe(first);
  } finally {
    resetPriceProviderForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
