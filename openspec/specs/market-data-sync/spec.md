# market-data-sync Specification

## Purpose
TBD - created by archiving change phase-5-market-data-fx. Update Purpose after archive.
## Requirements
### Requirement: Batch price sync

The system MUST run a single global batch price sync every 30 minutes via a Supabase Edge Function `sync-prices` scheduled by `pg_cron`. The function MUST compute the set of distinct `asset_id` values whose trades (excluding soft-deleted rows) yield a current quantity `> 0`, dedupe the list, and append the S&P 500 benchmark symbol `^GSPC` (resolved via the existing `assets.yahoo_symbol` or, if no asset row exists, inserted as a virtual benchmark row keyed by a synthetic id documented in the migration).

For each symbol, the function MUST call the `MarketDataProvider` registered in `src/lib/market-data/registry.ts`, then insert one row into `public.market_prices` with `source = 'YAHOO'` (or `'BENCHMARK'` for the S&P 500), `observed_at = now()`, and `delayed_until = now() + interval '15 minutes'`. Failures on individual symbols MUST NOT abort the batch; the failed symbol is recorded in `market_sync_runs.error` as a comma-separated list.

#### Scenario: Active asset is refreshed
- **WHEN** the cron job fires and an asset currently held by any user has not been refreshed in the last 30 minutes
- **THEN** `sync-prices` calls the provider for that symbol and inserts a fresh `market_prices` row

#### Scenario: S&P 500 is refreshed alongside holdings
- **WHEN** the cron job fires
- **THEN** the batch includes `^GSPC` regardless of whether anyone holds a US asset, so the benchmark chart has data on day one

#### Scenario: A single symbol fails without aborting the batch
- **WHEN** Yahoo Finance returns 404 for one of the symbols in the batch
- **THEN** the function skips that symbol, records it in `market_sync_runs.error`, and continues with the remaining symbols

#### Scenario: Closed market (no fresh price)
- **WHEN** Yahoo Finance returns HTTP 200 but `meta.regularMarketPrice` is `null` (market closed, delisted)
- **THEN** the function does not insert a new row and does not record an error; the previous `market_prices` row remains the latest

### Requirement: Daily FX sync

The system MUST run `sync-fx-rates` once per day at 06:00 UTC via `pg_cron`. The function MUST call the `FxRateProvider` for the pair `('USD', 'COP')` and insert one row into `public.fx_rates` with `source = 'open.er-api.com'`.

#### Scenario: Daily FX refresh
- **WHEN** the daily cron fires
- **THEN** exactly one new row appears in `fx_rates` for `('USD','COP')` with the rate returned by the provider

#### Scenario: FX provider returns an invalid payload
- **WHEN** open.er-api.com returns a payload missing `rates.COP`
- **THEN** the function records the failure in `market_sync_runs` (kind = `'FX'`, status = `'FAILED'`) and does NOT insert a `fx_rates` row

### Requirement: Sync run audit table

The system MUST maintain a `public.market_sync_runs` table with columns `id, kind ('PRICES' | 'FX'), started_at, finished_at, status ('RUNNING' | 'SUCCESS' | 'FAILED'), assets_processed, error`. The table MUST have RLS enabled and no policies granted to `anon` or `authenticated`; only the service role can read or write it. Each Edge Function MUST insert a row at start with `status = 'RUNNING'` and update it on completion.

#### Scenario: Successful run leaves a clean trail
- **WHEN** `sync-prices` finishes without errors
- **THEN** a row exists in `market_sync_runs` with `status = 'SUCCESS'`, `finished_at > started_at`, and `assets_processed` equal to the number of symbols attempted

#### Scenario: Users cannot read sync runs
- **WHEN** an authenticated user runs `select * from public.market_sync_runs`
- **THEN** the query returns zero rows (RLS denies)

### Requirement: Manual trigger endpoint for development

The system MUST expose `POST /api/v1/admin/sync/run` accepting `{ kind: 'PRICES' | 'FX' }` and requiring the caller to be an `OWNER` of the current portfolio. The endpoint MUST call the Postgres function `public.enqueue_sync_run(kind)` via the service-role client, which uses `pg_net.http_post` to invoke the corresponding Edge Function. The endpoint MUST return HTTP 202 with `{ runId: uuid }` referencing the newly-created `market_sync_runs` row.

#### Scenario: OWNER triggers a price sync
- **WHEN** an OWNER posts `{ kind: 'PRICES' }` to the endpoint
- **THEN** a new `market_sync_runs` row with `status = 'RUNNING'` exists within 2 seconds and the Edge Function receives an HTTP POST

#### Scenario: Non-OWNER is rejected
- **WHEN** a VIEWER or EDITOR posts to the endpoint
- **THEN** the endpoint returns HTTP 403 with the standard error shape

#### Scenario: pg_cron fallback documented
- **WHEN** the `pg_cron` extension is not enabled in the target Supabase project
- **THEN** the migration's `create extension if not exists pg_cron` is a no-op, the Edge Functions are still deployable, and the README documents how to drive them from an external cron (GitHub Actions or similar) hitting the admin endpoint with a service-role token

