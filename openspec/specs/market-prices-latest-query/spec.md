# market-prices-latest-query Specification

## Purpose
TBD - created by archiving change performance-high-impact. Update Purpose after archive.
## Requirements
### Requirement: Efficient latest market prices accessor

The system MUST provide a SQL function `get_latest_market_prices(p_asset_ids uuid[])` that returns at most one `market_prices` row per asset id (the most recent non-delayed one), using `DISTINCT ON (asset_id) ... ORDER BY asset_id, observed_at DESC` to leverage the `market_prices_asset_id_observed_at_idx` index. `loadLatestMarketPrices` in `src/lib/dashboard/loader.ts` MUST fetch prices via `.rpc("get_latest_market_prices", { p_asset_ids: assetIds })` instead of selecting all historical rows and deduplicating in JavaScript. A row whose `delayed_until` is in the future MUST be excluded by the function (equivalent to the existing JS `delayed_until > now` filter).

#### Scenario: One price per asset
- **WHEN** `loadLatestMarketPrices` is called with 20 asset ids where each asset has 90 days of daily price history
- **THEN** the function returns exactly 20 rows (one per asset) and the Supabase query transfers no more than 20 rows over the wire

#### Scenario: Delayed prices are excluded
- **WHEN** an asset's latest `market_prices` row has `delayed_until` in the future but an earlier row is not delayed
- **THEN** the function returns the earlier non-delayed row for that asset

#### Scenario: Empty asset list
- **WHEN** `loadLatestMarketPrices` is called with an empty `assetIds` array
- **THEN** no RPC call is issued and an empty array is returned (preserving the existing early-return behavior)

### Requirement: PGlite schema-test compatibility

The `get_latest_market_prices` function definition MUST be applied successfully by the PGlite-based schema smoke test in `src/supabase/migrations/schema.test.ts` without a live Supabase connection. If PGlite cannot execute `DISTINCT ON` inside a `LANGUAGE sql` function, the migration MUST fall back to a definition that the test can apply (e.g. a plain `SELECT` function or no function) and `loadLatestMarketPrices` MUST retain a JS fallback path that preserves correctness, documented in the change.

#### Scenario: Schema test passes without Supabase
- **WHEN** `pnpm test:run` runs the schema smoke test against PGlite
- **THEN** the migration containing `get_latest_market_prices` applies cleanly and the test passes
