## 1. Calculation modules (TDD)

- [x] 1.1 Add `holdings.ts` to `src/lib/calculations/` with `aggregateHoldings(trades, assets)` that groups trades by `asset_id` and returns per-holding `{ assetId, ticker, assetName, sector, country, brokerId, brokerCode, brokerName, quantity, averageCost, totalInvested, realizedPnl }` and unit test it in `src/__tests__/calculations/holdings.test.ts`
- [x] 1.2 Add `pricing.ts` with `resolveAssetPrice({ assetId, latestMarketPrice, fallbackTradePriceUsd })` returning `{ priceUsd, isEstimated, source: 'MARKET' | 'TRADE_FALLBACK' }` and unit test it (including delayed market price is ignored)
- [x] 1.3 Add `equity.ts` with `calculateTotalEquity(holdings, priceResolver)` returning `{ equityUsd, isAnyEstimated }` and unit test it (zero holdings, one holding, mixed estimated/market)
- [x] 1.4 Add `pnl.ts` with `calculatePortfolioPnl(holdings, equity)` and `calculateReturnPct(investedUsd, equityUsd, realizedPnlUsd)` and unit test both (zero invested edge case)
- [x] 1.5 Add `distribution.ts` with `groupByDimension(holdings, dim: 'broker' | 'sector' | 'country', assets, brokers)` that returns `{ totalUsd, slices, unclassified }` with the residual-rounding rule and unit test it (sums to exactly 100, missing metadata routes to "Sin clasificar")
- [x] 1.6 Add `evolution.ts` with `buildPortfolioValueSeries(trades, { granularity, from?, to? })` returning `{ points: { date, valueUsd }[] }` and unit test it (ascending sort, monthly bucket boundaries, empty input, single trade)
- [x] 1.7 Add `drawdown.ts` with `calculateDrawdown(points)` returning `{ series, maxDrawdownPct }` and unit test it (monotonic, peak-to-trough detection, empty input)
- [x] 1.8 Add `returns-aggregation.ts` with `aggregateReturns(trades, holdings, { groupBy: 'month' | 'year' | 'stock' | 'broker' })` and unit test it (each groupBy, sort order, zero invested)

## 2. Dashboard loader and validations

- [x] 2.1 Add `src/lib/dashboard/loader.ts` exporting `loadDashboardData(portfolioId)` and the `DashboardData` type with `trades`, `latestMarketPrices`, and the joined `assets`/`brokers` metadata needed by the calc modules
- [x] 2.2 Add `src/lib/validations/dashboard.ts` with Zod schemas for each endpoint's query params (`SummaryQuery`, `DistributionQuery`, `EvolutionQuery`, `ReturnsQuery`, `DrawdownQuery`) and for the response DTOs

## 3. Dashboard API endpoints

- [x] 3.1 Create `src/app/api/v1/dashboard/summary/route.ts` GET handler that uses the loader + `equity` + `pnl` modules and returns the response shape from the spec
- [x] 3.2 Create `src/app/api/v1/dashboard/distribution/route.ts` GET handler that calls the `distribution` module
- [x] 3.3 Create `src/app/api/v1/dashboard/evolution/route.ts` GET handler that calls the `evolution` module and respects the `from`/`to` window
- [x] 3.4 Create `src/app/api/v1/dashboard/returns/route.ts` GET handler that calls the `returns-aggregation` module
- [x] 3.5 Create `src/app/api/v1/dashboard/drawdown/route.ts` GET handler that calls the `drawdown` module on the evolution series
- [x] 3.6 Add integration tests for each endpoint in `src/__tests__/api/dashboard/` following the mock builder pattern from `src/__tests__/api/trades.test.ts` (validation 422, success shape, error shape)

## 4. UI: chart components and dashboard client

- [x] 4.1 Add `src/lib/i18n/dashboard.ts` with all Spanish labels (KPI titles, chart titles, empty states, "Sin clasificar", "Disponible en Fase 5", tooltips)
- [x] 4.2 Add `src/components/charts/summary-cards.tsx` that renders the four KPI cards with the USD formatter and the "estimated" banner
- [x] 4.3 Add `src/components/charts/evolution-chart.tsx` (Recharts `AreaChart`) that hides itself when `points` is empty
- [x] 4.4 Add `src/components/charts/distribution-chart.tsx` (Recharts `PieChart` + slice list) with the `dim` selector and the "Sin clasificar" tooltip
- [x] 4.5 Add `src/components/charts/returns-table.tsx` with the `groupBy` selector and a `<table>` showing the four numeric columns
- [x] 4.6 Add `src/components/charts/drawdown-chart.tsx` (Recharts `AreaChart` with negative-axis fill) and the `maxDrawdownPct` headline
- [x] 4.7 Add `src/components/charts/benchmark-placeholder.tsx` showing the "Disponible en Fase 5" card
- [x] 4.8 Add `src/features/dashboard/use-dashboard-data.ts` (custom hook that issues the five requests in parallel via `Promise.all`)
- [x] 4.9 Add `src/features/dashboard/dashboard-page-client.tsx` that orchestrates the sections and handles `loading` / `empty` / `ready` states

## 5. Wire dashboard into the home route

- [x] 5.1 Replace `src/app/page.tsx` to render `MainNavigation` + `DashboardPageClient` and remove the static "USD 0.00" hero
- [x] 5.2 Update `src/app/page.test.tsx` to assert the new dashboard shell (heading, navigation, KPI section presence) and the empty-state behavior
- [x] 5.3 Update `tests/e2e/home.spec.ts` to assert the dashboard renders on a mobile viewport (KPI cards visible, navigation present)

## 6. Verification and documentation

- [x] 6.1 Run `pnpm lint` and resolve any lint failures
- [x] 6.2 Run `pnpm test:run` and ensure all new and existing tests pass
- [x] 6.3 Run `pnpm build` to confirm there are no type errors (Next 15 is the de-facto typecheck)
- [x] 6.4 Tick every task in `docs/investment-tracker/phases/03-dashboard-mvp.md` and update `README.md` to mark Phase 3 complete
