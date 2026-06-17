## 1. Provider interfaces + Yahoo implementation

- [ ] 1.1 Create `src/lib/market-data/types.ts` with `MarketQuote`, `BenchmarkPoint`, `MarketDataError`, and the `MarketDataProvider` interface.
- [ ] 1.2 Create `src/lib/market-data/yahoo-finance.schema.ts` with Zod schemas for the `/v8/finance/chart` response (meta + indicators.quote array).
- [ ] 1.3 Create `src/lib/market-data/yahoo-finance.ts` with `YahooFinanceMarketDataProvider`, including the 2 s single-retry, the 404-to-`NOT_FOUND` mapping, and the `parseChartResponse` function.
- [ ] 1.4 Create `src/lib/market-data/registry.ts` exporting `getMarketDataProvider(): MarketDataProvider` (defaults to Yahoo).
- [ ] 1.5 Create `src/lib/market-data/staleness.ts` with `PRICE_STALE_MS` (2 h) and `isStale()`.
- [ ] 1.6 Create `src/lib/market-data/symbols.ts` with `resolveYahooSymbol(asset): string | null` returning `asset.yahoo_symbol ?? asset.ticker ?? null`.
- [ ] 1.7 Create `tests/unit/market-data/yahoo-finance.test.ts` with 4 fixtures: valid quote, valid series, 404, `regularMarketPrice=null`, malformed payload.
- [ ] 1.8 Create `tests/unit/market-data/staleness.test.ts`.

## 2. FxRateProvider + open.er-api.com

- [ ] 2.1 Create `src/lib/fx/types.ts` with `FxRate`, `FxRateError`, and the `FxRateProvider` interface.
- [ ] 2.2 Create `src/lib/fx/open-er-api.schema.ts` with the Zod schema for the `latest/{base}` response.
- [ ] 2.3 Create `src/lib/fx/open-er-api.ts` with `OpenErApiFxRateProvider`.
- [ ] 2.4 Create `src/lib/fx/registry.ts` exporting `getFxRateProvider(): FxRateProvider`.
- [ ] 2.5 Create `src/lib/fx/staleness.ts` with `FX_STALE_MS` (24 h) and `isStale()`.
- [ ] 2.6 Create `src/lib/fx/loader.ts` with `getLatestFxRateUsdToCop(supabase): Promise<{ rate, observedAt, isStale } | null>`.
- [ ] 2.7 Create `tests/unit/fx/open-er-api.test.ts` with 2 fixtures: valid USD→COP, missing COP key.
- [ ] 2.8 Create `tests/unit/fx/loader.test.ts` against PGlite (empty table, fresh row, stale row).

## 3. Snapshot endpoint + dashboard refactor

- [ ] 3.1 Create `src/lib/market-data/loader.ts` exporting `getMarketDataSnapshot(portfolioId, supabase): Promise<MarketDataSnapshot>`.
- [ ] 3.2 Create `src/app/api/v1/market-data/snapshot/route.ts` (GET) that uses `requireApiUser()` and calls the loader.
- [ ] 3.3 Refactor `src/lib/dashboard/loader.ts` to call `getMarketDataSnapshot` instead of doing the manual `market_prices` join; preserve the `latestMarketPrices: MarketPriceRow[]` shape on `DashboardData` so downstream code is unchanged.
- [ ] 3.4 Update `src/components/charts/summary-cards.tsx` to accept `isAnyStale` and `isAnyEstimated` props and render the Spanish badges.
- [ ] 3.5 Update `src/components/charts/distribution-chart.tsx` to accept a per-row `isStale` flag and render the clock icon / "≈" prefix.
- [ ] 3.6 Add new strings to `src/lib/i18n/dashboard.ts` (`priceEstimated`, `priceStale`, `benchmarkNotSynced`, `syncNow`).
- [ ] 3.7 Create `tests/integration/market-data/snapshot.test.ts` (Vitest + PGlite) covering: empty portfolio, mixed stale+estimated quotes, missing FX, present benchmark.

## 4. Benchmark chart

- [ ] 4.1 Create `src/components/charts/benchmark-chart.tsx` overlaying the normalized S&P 500 series on the portfolio evolution series. Reuse the Recharts patterns from `evolution-chart.tsx`.
- [ ] 4.2 Replace `BenchmarkPlaceholder` usage in `src/features/dashboard/dashboard-page-client.tsx` with `BenchmarkChart`.
- [ ] 4.3 Delete `src/components/charts/benchmark-placeholder.tsx`.

## 5. Trade form FX pre-fill

- [ ] 5.1 Create `src/features/trades/use-latest-fx-rate.ts` (TanStack Query hook over the snapshot endpoint).
- [ ] 5.2 Wire the hook into the existing `TradeForm*` clients (new and edit): on mount and on `currency_original` change to `COP`, fetch and pre-fill `fx_rate_to_usd`. Show a read-only hint with `observedAt` and a staleness badge.
- [ ] 5.3 Add the new strings to `src/lib/i18n/trades.ts` (`fxUpdatedAt`, `fxStaleHint`, `fxMissingHint`).

## 6. DB migration

- [ ] 6.1 Create `supabase/migrations/0004_market_data_sync.sql` with:
  - `create extension if not exists pg_cron;` and `create extension if not exists pg_net;`
  - `create table public.market_sync_runs` (id, kind, started_at, finished_at, status, assets_processed, error) + RLS + no policies.
  - `create function public.enqueue_sync_run(text) returns void` (security definer, calls `net.http_post`).
  - Two `select cron.schedule(...)` calls: `sync-prices-30m` (`*/30 * * * *`) and `sync-fx-rates-daily` (`0 6 * * *`).
  - `grant execute on function public.enqueue_sync_run(text) to service_role;`
  - Insert the synthetic S&P 500 asset row (ticker `^GSPC`, sector `BENCHMARK`, country `US`, currency `USD`, yahoo_symbol `^GSPC`).
- [ ] 6.2 Extend `src/supabase/migrations/schema.test.ts` to stub the `net` schema (mirror of the `auth`/`extensions` stub) and assert the new table + the two `cron.schedule` calls. Strip the `pg_cron`/`pg_net` `create extension` lines the same way `pgcrypto` is stripped.
- [ ] 6.3 Add a comment block at the top of the migration explaining the `app.edge_function_base` and `app.service_role_key` settings that must be configured per environment. Do NOT commit real values.

## 7. Edge Functions (Deno)

- [ ] 7.1 Create `supabase/functions/_shared/supabase.ts` with a small helper that builds a service-role Supabase client from the env vars Supabase injects.
- [ ] 7.2 Create `supabase/functions/_shared/record-sync-run.ts` with `recordRunStart`, `recordRunSuccess`, `recordRunFailure`.
- [ ] 7.3 Create `supabase/functions/sync-prices/index.ts`:
  - Compute the active-assets SQL set.
  - Append the S&P 500 benchmark symbol.
  - Call `getMarketDataProvider().getQuote(...)` for each symbol.
  - Insert `market_prices` rows with `delayed_until = now() + 15 min` and `source = 'YAHOO'` (or `'BENCHMARK'` for `^GSPC`).
  - Record start/finish in `market_sync_runs`.
- [ ] 7.4 Create `supabase/functions/sync-fx-rates/index.ts`:
  - Call `getFxRateProvider().getRate('USD', 'COP')`.
  - Insert a `fx_rates` row and a `market_sync_runs` row.

## 8. Admin sync trigger

- [ ] 8.1 Create `src/app/api/v1/admin/sync/run/route.ts` (POST, OWNER only) accepting `{ kind: 'PRICES' | 'FX' }`. Validates with Zod, checks role, calls `enqueue_sync_run` via the service-role client, returns 202 with `{ runId }`.
- [ ] 8.2 Add the dev-only "Sincronizar ahora" button to `BenchmarkChart` (gated by `process.env.NODE_ENV !== 'production'`).

## 9. Documentation

- [ ] 9.1 Add a "Sincronización de precios y FX" section to `README.md` with: cadence, monthly cost estimate (~43K invocations), how to disable the crons (SQL snippet), and the GitHub Actions fallback if `pg_cron` is not enabled.
- [ ] 9.2 Update `AGENTS.md` with a brief mention of `src/lib/market-data/` and `src/lib/fx/` under the architecture section.
- [ ] 9.3 Tick the tasks in `docs/investment-tracker/phases/05-market-data-fx.md`.

## 10. Final verification

- [ ] 10.1 `pnpm lint`
- [ ] 10.2 `pnpm test:run`
- [ ] 10.3 `pnpm build`
- [ ] 10.4 Manual: hit `POST /api/v1/admin/sync/run` with `{ kind: 'PRICES' }`; confirm a `market_sync_runs` row appears with `status = 'SUCCESS'` and a few `market_prices` rows.
- [ ] 10.5 Manual: open `/`, confirm the benchmark chart renders with two lines and the staleness badge does not appear.
