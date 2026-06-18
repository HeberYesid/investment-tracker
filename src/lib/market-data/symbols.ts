export type YahooSymbolCandidateInput = {
  ticker: string;
  yahooSymbol?: string | null;
  currency?: string | null;
};

const COLOMBIAN_SUFFIX = ".CO";

export function candidateYahooSymbols(
  input: YahooSymbolCandidateInput,
): string[] {
  const candidates: string[] = [];
  const push = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  push(input.yahooSymbol);
  push(input.ticker);

  if (
    input.currency === "COP" &&
    !input.ticker.includes(".") &&
    !input.ticker.toUpperCase().endsWith(COLOMBIAN_SUFFIX)
  ) {
    push(`${input.ticker}${COLOMBIAN_SUFFIX}`);
  }

  return candidates;
}
