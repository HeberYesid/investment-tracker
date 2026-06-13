export type MarketPriceRow = {
  asset_id: string;
  price_usd: number;
  observed_at: string;
  delayed_until: string | null;
};

export type ResolvedPrice = {
  priceUsd: number;
  isEstimated: boolean;
  source: "MARKET" | "TRADE_FALLBACK";
};

export type ResolvePriceInput = {
  assetId: string;
  latestMarketPrice: MarketPriceRow | undefined;
  fallbackTradePriceUsd: number | undefined;
  now?: Date;
};

export function resolveAssetPrice(input: ResolvePriceInput): ResolvedPrice {
  const { assetId, latestMarketPrice, fallbackTradePriceUsd, now } = input;
  const nowDate = now ?? new Date();

  if (latestMarketPrice && latestMarketPrice.asset_id === assetId) {
    const isDelayed =
      latestMarketPrice.delayed_until !== null &&
      new Date(latestMarketPrice.delayed_until) > nowDate;
    if (!isDelayed) {
      return {
        priceUsd: latestMarketPrice.price_usd,
        isEstimated: false,
        source: "MARKET",
      };
    }
  }

  if (fallbackTradePriceUsd !== undefined) {
    return {
      priceUsd: fallbackTradePriceUsd,
      isEstimated: true,
      source: "TRADE_FALLBACK",
    };
  }

  return { priceUsd: 0, isEstimated: true, source: "TRADE_FALLBACK" };
}
