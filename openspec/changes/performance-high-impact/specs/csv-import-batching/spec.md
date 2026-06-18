## ADDED Requirements

### Requirement: Batched asset resolution on CSV commit

The CSV commit handler (`/api/v1/imports/csv/commit`) MUST NOT perform a per-row asset lookup (`select id from assets where ticker = ?`). It MUST reuse the asset map already built during the preview phase (`existingTickers`/`profileByTicker`) for known tickers and insert all newly-seen tickers in a single `supabase.from("assets").insert([...]).select("id, ticker")` call, building a `Map<ticker, assetId>` from the result. Rows whose asset cannot be resolved or created MUST be recorded in the `errors` array with their `row_number` and skipped, without aborting the batch.

#### Scenario: Import with only known tickers
- **WHEN** a 500-row CSV is committed where every ticker already exists in `assets`
- **THEN** zero `assets` SELECT queries and zero `assets` INSERT queries are issued during the per-row loop (the preview map is reused)

#### Scenario: Import with new tickers
- **WHEN** a CSV introduces 10 new tickers among 500 rows
- **THEN** exactly one `assets` INSERT (with 10 rows) is issued, and each new ticker is mapped to its returned id

#### Scenario: A new ticker fails to insert
- **WHEN** one new ticker violates a constraint during the batch asset insert
- **THEN** the rows referencing that ticker are recorded in `errors` with their row numbers and the remaining valid rows still commit

### Requirement: Batched trade insert on CSV commit

The CSV commit handler MUST insert all valid trades in a single `supabase.from("trades").insert([...])` call (partitioned into chunks if necessary to stay within payload limits), after applying `normalizeTradeUsdValues` to each. It MUST NOT issue one INSERT per row. The final response MUST preserve the existing observable contract: an `importedCount` and an `errors` array of `{ row_number, message }`.

#### Scenario: All rows valid
- **WHEN** a 500-row CSV is committed and every row normalizes successfully
- **THEN** exactly one `trades` INSERT (or one per chunk) is issued and `importedCount` equals the number of valid rows

#### Scenario: Mixed valid and invalid rows
- **WHEN** a CSV has 480 valid rows and 20 rows with normalization errors
- **THEN** the 20 invalid rows appear in `errors`, the 480 valid rows are inserted in a single batch, and `importedCount` is 480

#### Scenario: Response contract unchanged
- **WHEN** the commit completes (success or partial)
- **THEN** the response body still contains `importedCount` and `errors` with the same shape clients already consume
