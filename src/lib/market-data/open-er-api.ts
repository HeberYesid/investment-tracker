import {
  type FxCurrency,
  type FxRateProvider,
  type FetchedFxRate,
  type FetchLike,
  type PriceProviderError,
} from "./types";
import { getMarketDataEnv, type MarketDataEnv } from "./config";

type OpenErApiResponse = {
  result?: string;
  base_code?: string;
  time_last_update_unix?: number;
  rates?: Record<string, number>;
};

export type OpenErApiFxProviderOptions = {
  fetchImpl?: FetchLike;
  env?: MarketDataEnv;
};

export function createOpenErApiFxProvider(
  opts: OpenErApiFxProviderOptions = {},
): FxRateProvider {
  const env = opts.env ?? getMarketDataEnv();
  const fetchImpl: FetchLike =
    opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  return {
    async fetchLatestRates() {
      const url = `${env.fxBaseUrl}/USD`;
      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(url, {
          headers: {
            "User-Agent": env.userAgent,
            Accept: "application/json",
          },
        });
      } catch (cause) {
        throw buildError(
          "TRANSIENT",
          "Error contacting open.er-api.com for FX rates",
          cause,
        );
      }

      if (response.status === 429) {
        throw buildError("RATE_LIMITED", "open.er-api.com rate limited");
      }
      if (!response.ok) {
        throw buildError(
          "PERMANENT",
          `open.er-api.com returned ${response.status}`,
        );
      }

      const body = (await response.json()) as OpenErApiResponse;
      if (body.result !== "success") {
        throw buildError(
          "PERMANENT",
          "open.er-api.com reported a non-success result",
        );
      }
      if (!body.rates || typeof body.rates !== "object") {
        throw buildError("PERMANENT", "open.er-api.com returned no rates");
      }
      const observedAt = new Date(
        (body.time_last_update_unix ?? Math.floor(Date.now() / 1000)) * 1000,
      ).toISOString();
      const usd = body.rates.USD;
      if (typeof usd !== "number" || usd !== 1) {
        throw buildError(
          "PERMANENT",
          "open.er-api.com did not include USD: 1 in its rates",
        );
      }
      const cop = body.rates.COP;
      if (typeof cop !== "number" || cop <= 0) {
        throw buildError(
          "PERMANENT",
          "open.er-api.com did not include a positive COP rate",
        );
      }

      const rates: FetchedFxRate[] = [
        { fromCurrency: "USD", toCurrency: "USD", rate: 1, observedAt },
        {
          fromCurrency: "USD",
          toCurrency: "COP",
          rate: cop,
          observedAt,
        },
        {
          fromCurrency: "COP",
          toCurrency: "USD",
          rate: 1 / cop,
          observedAt,
        },
      ];
      return rates;
    },
  };
}

export function buildError(
  code: PriceProviderError["code"],
  message: string,
  cause?: unknown,
): PriceProviderError {
  return { code, message, cause };
}

export function pickFxRate(
  rates: FetchedFxRate[],
  from: FxCurrency,
  to: FxCurrency,
): FetchedFxRate | null {
  return rates.find((r) => r.fromCurrency === from && r.toCurrency === to) ?? null;
}
