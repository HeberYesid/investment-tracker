## ADDED Requirements

### Requirement: Composite price provider with Stooq fallback

The system MUST expose a `CompositeProvider` in `src/lib/market-data/composite.ts` that implements the `PriceProvider` interface (`src/lib/market-data/types.ts:44-47`) by orchestrating two concrete providers in order: `YahooProvider` (registered in `src/lib/market-data/registry.ts` as the primary) and `StooqProvider` (new, registered as the fallback). The composite MUST attempt the primary provider first; if the primary returns a `PriceProviderError` with `code` in `{'RATE_LIMITED', 'TRANSIENT', 'PERMANENT'}`, the composite MUST attempt the fallback for the same symbol. The composite MUST return the first successful quote and MUST tag the returned `FetchedQuote` with the source that produced it (`'YAHOO'` or `'STOOQ'`). If both providers fail, the composite MUST return the primary provider's error so that the calling Edge Function records the failure with the most informative code.

#### Scenario: Primary provider returns a valid quote
- **WHEN** the composite calls `fetchQuotes(['AAPL'])` and the Yahoo provider resolves with `{ symbol: 'AAPL', priceUsd: 192.34, observedAt: <iso>, ... }`
- **THEN** the composite resolves with the same quote object and the Stooq provider is not called

#### Scenario: Primary provider is rate-limited and fallback succeeds
- **WHEN** the composite calls `fetchQuotes(['AAPL'])` and the Yahoo provider rejects with `{ code: 'RATE_LIMITED', message: '...' }` and the Stooq provider resolves with `{ symbol: 'AAPL.US', priceUsd: 192.10, observedAt: <iso>, ... }`
- **THEN** the composite resolves with the Stooq quote, normalized so the `symbol` field equals the requested `'AAPL'` and the source tag is `'STOOQ'`

#### Scenario: Both providers fail
- **WHEN** the composite calls `fetchQuotes(['NOPE'])` and both Yahoo and Stooq reject with `RATE_LIMITED`
- **THEN** the composite rejects with the Yahoo error and the calling Edge Function records the symbol as failed in `market_sync_runs.error`

#### Scenario: Composite does not silently swallow permanent errors that are symbol-specific
- **WHEN** the composite calls `fetchQuotes(['DELISTED'])` and the Yahoo provider rejects with `{ code: 'PERMANENT', message: 'symbol not found' }` (a symbol-specific permanent error)
- **THEN** the composite still attempts the Stooq provider for the same symbol before giving up

### Requirement: Stooq provider

The system MUST expose a `StooqProvider` in `src/lib/market-data/stooq.ts` that implements the `PriceProvider` interface by calling `https://stooq.com/q/l/?s=<symbol>&f=sd2t2ohlcv&h&e=csv` with a desktop `User-Agent` header. The provider MUST validate the response body with a Zod schema before returning. The initial explicit map MUST contain only verified USD quotes (e.g. `AAPL` → `aapl.us`). For symbols not in that map the provider MUST reject with `{ code: 'NOT_FOUND' }` without making an HTTP request. The fallback MUST NOT request crypto, Colombian assets, or the benchmark.

#### Scenario: Stooq returns a valid CSV quote
- **WHEN** the provider calls Stooq for `aapl.us` and the response is `Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-06-17,21:00:00,191.50,193.10,190.80,192.40,12345678\n`
- **THEN** the provider resolves with `{ symbol: 'AAPL', priceUsd: 192.40, currency: 'USD', observedAt: <ISO from Date+Time>, delayedUntil: null }`

#### Scenario: Stooq returns a malformed CSV
- **WHEN** the provider calls Stooq and the response body is not a CSV matching the Zod schema (missing columns, non-numeric Close, etc.)
- **THEN** the provider rejects with `{ code: 'INVALID_PAYLOAD', message: 'Stooq returned malformed CSV' }`

#### Scenario: Stooq HTTP 429
- **WHEN** the provider calls Stooq and the response is HTTP 429
- **THEN** the provider rejects with `{ code: 'RATE_LIMITED', message: 'Stooq rate limited' }`

#### Scenario: Symbol has no Stooq equivalent
- **WHEN** the provider is asked for a symbol that the local mapping table does not cover
- **THEN** the provider rejects with `{ code: 'NOT_FOUND', message: 'No Stooq mapping for <symbol>' }` without making an HTTP request

### Requirement: market_prices source includes Stooq

The system MUST persist the effective price provider on every `market_prices` row. The `source` column MUST accept `'STOOQ'` without a schema change and preserve `'YAHOO'`, `'BENCHMARK'`, `'PRICE_HISTORY'`, and `'BENCHMARK_HISTORY'`. The Edge Function `sync-prices` MUST set `source` to the value returned by the composite (i.e. `'YAHOO'` if the composite got the quote from Yahoo, `'STOOQ'` if it fell back to Stooq, `'BENCHMARK'` for the S&P 500 row).

#### Scenario: Composite used Yahoo
- **WHEN** the Edge Function inserts a `market_prices` row after the composite resolved from Yahoo
- **THEN** the row's `source` column equals `'YAHOO'`

#### Scenario: Composite fell back to Stooq
- **WHEN** the Edge Function inserts a `market_prices` row after the composite resolved from Stooq
- **THEN** the row's `source` column equals `'STOOQ'`

#### Scenario: Existing schema accepts all five sources
- **WHEN** a test inserts rows with `STOOQ`, `YAHOO`, `BENCHMARK`, `PRICE_HISTORY`, and `BENCHMARK_HISTORY` into the existing schema
- **THEN** all five values can be read back unchanged
