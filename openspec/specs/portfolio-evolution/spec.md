# portfolio-evolution Specification

## Purpose
TBD - created by archiving change evolution-chart-historical-prices. Update Purpose after archive.

## Requirements

### Requirement: Evolution series uses historical market prices per bucket

The system MUST compute the value of the portfolio at each evolution bucket by looking up the latest `market_prices.price_usd` for each held asset whose `observed_at` is `<= bucketDate` and whose `source = 'PRICE_HISTORY'`. The bucket value is `Σ quantity_held_in_bucket * priceAtBucket(asset, bucketDate)`. If no `PRICE_HISTORY` row exists for an asset at or before a bucket, the system MUST fall back to the latest `price_usd` from any active trade of that asset on or before `bucketDate`. The system MUST NOT use `DIVIDEND`, `FEE`, `TRANSFER_IN` or `TRANSFER_OUT` trade rows to determine the fallback price (only `BUY` and `SELL` set the fallback price for the asset).

#### Scenario: Held asset has historical prices for every bucket
- **WHEN** an asset is held from January through April and `market_prices.PRICE_HISTORY` contains rows for that asset with `observed_at` falling on the last day of each month
- **THEN** each bucket's value uses the corresponding historical `price_usd`, and the line moves gradually across months

#### Scenario: Asset is bought mid-series
- **WHEN** a user buys asset X on February 15 and `market_prices.PRICE_HISTORY` has rows for X on the last day of February, March, and April
- **THEN** the February bucket value includes X's quantity times February's historical price; the March and April buckets update as X's market price changes; the January bucket does NOT include X

#### Scenario: Asset has no historical price for some buckets
- **WHEN** an asset is held from January through April but `market_prices.PRICE_HISTORY` has rows only for March and April
- **THEN** January and February buckets use the fallback (last `BUY`/`SELL` price on or before that bucket); March and April buckets use the historical price

#### Scenario: DIVIDEND does not corrupt the fallback price
- **WHEN** a user holds asset X (last `BUY` at $100) and records a `DIVIDEND` trade in February with `price_usd = 0`
- **THEN** the February bucket's value for X is `quantity * 100` (fallback to last `BUY` price), not `quantity * 0`

#### Scenario: Asset is fully sold mid-series
- **WHEN** a user sells all shares of asset X in February and the holding is empty from March onward
- **THEN** the March and April buckets do NOT include X in the value computation, regardless of whether `PRICE_HISTORY` has rows for X

### Requirement: EvolutionResponse exposes isEstimated flag

The system MUST include an `isEstimated: boolean` field in the `EvolutionResponse` payload (returned by `GET /api/v1/dashboard/aggregate` and `GET /api/v1/dashboard/evolution`). The flag MUST be `true` when at least one point in the series had to use the fallback (no `PRICE_HISTORY` row for any held asset at that bucket). The flag MUST be `false` when every point of the series used `PRICE_HISTORY` for every held asset.

#### Scenario: All points use historical prices
- **WHEN** `market_prices.PRICE_HISTORY` covers every held asset on every bucket date in the requested range
- **THEN** `EvolutionResponse.isEstimated === false`

#### Scenario: At least one point uses the fallback
- **WHEN** at least one bucket has no `PRICE_HISTORY` row for at least one held asset
- **THEN** `EvolutionResponse.isEstimated === true`

### Requirement: Evolution series skips empty pre-first-trade buckets

The system MUST NOT emit a bucket with `valueUsd = 0` for months that precede the user's first trade. The first point of the series MUST be the bucket of the first trade's month, and `from` MUST be the first trade date (not earlier).

#### Scenario: First trade is in February
- **WHEN** a user's only trades are in February and March
- **THEN** the response contains exactly two points, dated the last day of February and the last day of March respectively; no January point is emitted with `valueUsd = 0`
