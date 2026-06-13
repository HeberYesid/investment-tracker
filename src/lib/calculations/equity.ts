import type { Holding } from "./holdings";
import { resolveAssetPrice, type MarketPriceRow } from "./pricing";

export type EquityBreakdown = {
  equityUsd: number;
  isAnyEstimated: boolean;
};

export function calculateTotalEquity(
  holdings: Holding[],
  marketPrices: MarketPriceRow[],
): EquityBreakdown {
  let equityUsd = 0;
  let isAnyEstimated = false;

  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;

    const tradesForAsset = marketPrices.filter(
      (m) => m.asset_id === holding.assetId,
    );
    const latest = tradesForAsset[0];
    const fallback = holding.averageCost;
    const resolved = resolveAssetPrice({
      assetId: holding.assetId,
      latestMarketPrice: latest,
      fallbackTradePriceUsd: fallback,
    });

    equityUsd += resolved.priceUsd * holding.quantity;
    if (resolved.isEstimated) isAnyEstimated = true;
  }

  return { equityUsd, isAnyEstimated };
}
