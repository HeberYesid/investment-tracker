import { describe, expect, it } from "vitest";

import { candidateYahooSymbols } from "@/lib/market-data/symbols";

describe("candidateYahooSymbols", () => {
  it("prefers yahoo_symbol over the raw ticker", () => {
    expect(
      candidateYahooSymbols({ ticker: "AAPL", yahooSymbol: "AAPL.MX" }),
    ).toEqual(["AAPL.MX", "AAPL"]);
  });

  it("falls back to the raw ticker when yahoo_symbol is missing", () => {
    expect(candidateYahooSymbols({ ticker: "AAPL" })).toEqual(["AAPL"]);
    expect(
      candidateYahooSymbols({ ticker: "AAPL", yahooSymbol: null }),
    ).toEqual(["AAPL"]);
  });

  it("appends the .CO suffix for COP-denominated tickers", () => {
    expect(
      candidateYahooSymbols({ ticker: "ECOPETROL", currency: "COP" }),
    ).toEqual(["ECOPETROL", "ECOPETROL.CO"]);
  });

  it("does not append .CO twice if the ticker already ends with .CO", () => {
    expect(
      candidateYahooSymbols({ ticker: "ECOPETROL.CO", currency: "COP" }),
    ).toEqual(["ECOPETROL.CO"]);
  });

  it("does not append .CO for non-COP currencies", () => {
    expect(
      candidateYahooSymbols({ ticker: "ECOPETROL", currency: "USD" }),
    ).toEqual(["ECOPETROL"]);
  });

  it("deduplicates candidates", () => {
    expect(
      candidateYahooSymbols({
        ticker: "AAPL",
        yahooSymbol: "AAPL",
        currency: "USD",
      }),
    ).toEqual(["AAPL"]);
  });

  it("trims whitespace from candidates", () => {
    expect(
      candidateYahooSymbols({ ticker: "  AAPL  ", yahooSymbol: " AAPL.MX " }),
    ).toEqual(["AAPL.MX", "AAPL"]);
  });
});
