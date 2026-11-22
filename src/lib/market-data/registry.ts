import { createCompositeProvider } from "./composite";
import { createStooqProvider } from "./stooq";
import { createYahooProvider } from "./yahoo";

let provider: ReturnType<typeof createCompositeProvider> | undefined;

export function getPriceProvider() {
  return provider ??= createCompositeProvider([createYahooProvider(), createStooqProvider()]);
}

export function resetPriceProviderForTests() {
  provider = undefined;
}
