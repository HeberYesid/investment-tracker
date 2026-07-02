## ADDED Requirements

### Requirement: Asset price history backfill

The system MUST run a daily batch that backfills historical market prices for every asset currently held (`quantity > 0` in any user's `holdings`, computed from `trades` excluding soft-deleted rows) and that has a non-null `assets.yahoo_symbol`. The backfill MUST be implemented as a Supabase Edge Function `sync-asset-prices-history` scheduled by `pg_cron` at 00:30 UTC, after the 30-minute intraday `sync-prices` job has fired for the day.

For each eligible asset, the Edge Function MUST call the Yahoo Finance provider's `fetchHistory(yahoo_symbol, "2y")` and MUST upsert one row per history point into `public.market_prices` with `price = point.value`, `price_usd = point.value`, `currency = "USD"`, `source = "PRICE_HISTORY"`, and `observed_at = point.date`. The upsert MUST be idempotent: re-running for the same `(asset_id, observed_at)` pair MUST NOT create a duplicate row. A symbol that fails to fetch MUST be recorded in `market_sync_runs.error` and MUST NOT abort the rest of the batch.

#### Scenario: Backfill inserts historical rows for held assets
- **WHEN** the cron job fires and the user holds assets AAPL and MSFT, and Yahoo returns ~520 daily points for each
- **THEN** `market_prices` gains one row per `(asset_id, observed_at)` pair with `source = "PRICE_HISTORY"`, totalling ~1040 new rows for the day

#### Scenario: Re-running the backfill is a no-op for existing dates
- **WHEN** the cron job fires a second time and the same `(asset_id, observed_at)` pairs already exist
- **THEN** no duplicate rows are inserted; the function reports `inserted: 0, skipped: <count>`

#### Scenario: Single symbol failure does not abort the batch
- **WHEN** Yahoo returns 404 for MSFT and a valid payload for AAPL
- **THEN** the function records MSFT in `market_sync_runs.error`, inserts the AAPL history, and finishes with `status = "SUCCESS"` (not `"FAILED"`)

#### Scenario: Asset with no yahoo_symbol is skipped
- **WHEN** the user holds an asset where `assets.yahoo_symbol IS NULL`
- **THEN** the function does not call Yahoo for that asset and does not record an error for it

#### Scenario: Empty portfolio
- **WHEN** no user has any asset with `quantity > 0` in `holdings`
- **THEN** the function inserts zero rows and finishes with `status = "SUCCESS"` and `assets_processed = 0`

### Requirement: Manual trigger for asset price history backfill

The `POST /api/v1/admin/sync/run` endpoint MUST accept `{ kind: "PRICES_HISTORY" }` in addition to the existing `"PRICES"` and `"FX"` kinds. The endpoint MUST call the `sync-asset-prices-history` Edge Function (via the existing `public.enqueue_sync_run(kind)` Postgres function and `pg_net.http_post` mechanism). The endpoint MUST require the caller to be an `OWNER` of the current portfolio, and MUST return HTTP 202 with `{ runId: uuid }` on success.

#### Scenario: OWNER triggers asset history sync
- **WHEN** an OWNER posts `{ kind: "PRICES_HISTORY" }` to the endpoint
- **THEN** a new `market_sync_runs` row with `kind = "PRICES_HISTORY"` and `status = "RUNNING"` is created, and the `sync-asset-prices-history` Edge Function is invoked

#### Scenario: Non-OWNER is rejected
- **WHEN** a VIEWER or EDITOR posts `{ kind: "PRICES_HISTORY" }` to the endpoint
- **THEN** the endpoint returns HTTP 403 with the standard error shape
