import { createYahooProvider } from "./yahoo";

let provider: ReturnType<typeof createYahooProvider> | undefined;

export function getPriceProvider() {
  return provider ??= createYahooProvider();
}

export function resetPriceProviderForTests() {
  provider = undefined;
}
