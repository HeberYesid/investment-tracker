import { expect, test } from "playwright/test";

// E2E test for the evolution chart historical prices feature.
// Requires a fully provisioned test environment:
//   - Supabase project with the migration 0010_asset_price_history.sql applied
//   - An authenticated OWNER session (via the dev login helper)
//   - Market sync settings EDGE_FUNCTION_BASE + SUPABASE_ANON_KEY populated
//
// To run locally, point NEXT_PUBLIC_SUPABASE_URL etc. at a test project,
// then enable the test by removing the `test.skip` line.

test.skip("evolution chart uses historical prices when available", async ({
  page,
  request,
}) => {
  // (a) Seed an asset with yahoo_symbol = "AAPL"
  const assetId = await request.post("/api/v1/test/seed-asset", {
    data: { ticker: "AAPL-TEST", yahoo_symbol: "AAPL" },
  });
  expect(assetId.ok()).toBeTruthy();

  // (b) Insert three historical market_prices rows (Feb/Mar/Apr 2025) at
  // source = "PRICE_HISTORY".
  const today = new Date("2025-04-30T20:00:00.000Z").toISOString();
  const prices = [
    { observed_at: "2025-02-28T20:00:00.000Z", price_usd: 110 },
    { observed_at: "2025-03-31T20:00:00.000Z", price_usd: 115 },
    { observed_at: "2025-04-30T20:00:00.000Z", price_usd: 120 },
  ];
  for (const price of prices) {
    const result = await request.post("/api/v1/test/seed-price", {
      data: { asset_id: assetId, source: "PRICE_HISTORY", ...price, today },
    });
    expect(result.ok()).toBeTruthy();
  }

  // (c) Register a BUY of 1 share at $100 on 2025-02-15.
  const trade = await request.post("/api/v1/trades", {
    data: {
      asset_id: assetId,
      trade_type: "BUY",
      trade_date: "2025-02-15",
      quantity: 1,
      price_usd: 100,
      commission_usd: 0,
    },
  });
  expect(trade.ok()).toBeTruthy();

  // (d) Navigate to the dashboard.
  await page.goto("/");
  const chart = page.getByTestId("evolution-chart");
  await expect(chart).toBeVisible();

  // (e) Verify the chart has at least 2 points and the tooltip of the
  // second point uses the historical price (not the trade price).
  const points = await chart.locator("circle, .recharts-dot").all();
  expect(points.length).toBeGreaterThanOrEqual(2);

  await points[1].hover();
  const tooltip = page.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/\$115/);
});
