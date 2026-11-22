import type { FetchedQuote, PriceProvider } from "./types";

// El orden es Yahoo → Stooq. Las consultas históricas usan solo Yahoo.
export function createCompositeProvider([yahoo, stooq]: [PriceProvider, PriceProvider]) {
  async function single(provider: PriceProvider, symbol: string) {
    const quote = provider.fetchQuote ? await provider.fetchQuote(symbol) : (await provider.fetchQuotes([symbol]))[0];
    if (!quote) throw { code: "PERMANENT", message: "El proveedor no devolvió precio" };
    return quote;
  }

  async function fetchQuote(symbol: string): Promise<FetchedQuote> {
    try {
      return { ...await single(yahoo, symbol), symbol, source: "YAHOO" };
    } catch (error) {
      try { return { ...await single(stooq, symbol), symbol, source: "STOOQ" }; }
      catch { throw error; }
    }
  }

  async function fetchQuotesWithBreakdown(symbols: string[]) {
    const results = await Promise.all(symbols.map(async (symbol) => {
      try { return { quote: await fetchQuote(symbol) }; }
      catch (error) { return { failure: { symbol, error } }; }
    }));
    const quotes = results.flatMap(({ quote }) => quote ? [quote] : []);
    return {
      quotes,
      yahooOk: quotes.filter(({ source }) => source === "YAHOO").length,
      stooqFallback: quotes.filter(({ source }) => source === "STOOQ").length,
      failures: results.flatMap(({ failure }) => failure ? [failure] : []),
    };
  }

  return {
    fetchQuote,
    fetchQuotes: async (symbols: string[]) => (await fetchQuotesWithBreakdown(symbols)).quotes,
    fetchQuotesWithBreakdown,
    fetchHistory: yahoo.fetchHistory.bind(yahoo),
  };
}
