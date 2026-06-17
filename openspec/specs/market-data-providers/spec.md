# market-data-providers Specification

## Purpose
TBD - created by archiving change phase-5-market-data-fx. Update Purpose after archive.
## Requirements
### Requirement: MarketDataProvider interface

The system SHALL expose a `MarketDataProvider` interface in `src/lib/market-data/provider.ts` with two methods: `getQuote(symbol: string): Promise<MarketQuote>` and `getBenchmarkSeries(symbol: string, rangeMonths: number): Promise<BenchmarkPoint[]>`. Quote and benchmark series responses MUST be validated with Zod before being returned to callers.

#### Scenario: Successful quote retrieval
- **WHEN** a caller invokes `getQuote("AAPL")` on a provider whose underlying HTTP call returns a valid Yahoo Finance chart payload
- **THEN** the method resolves with `{ symbol: "AAPL", price: number, currency: "USD", priceUsd: number, observedAt: ISO8601 string }`

#### Scenario: Malformed provider response
- **WHEN** the underlying HTTP call returns a payload that fails Zod validation (missing `meta.regularMarketPrice`, no `timestamp` array, etc.)
- **THEN** the method rejects with a `MarketDataError` whose `code === "INVALID_PAYLOAD"`

#### Scenario: Symbol not found
- **WHEN** the underlying HTTP call returns HTTP 404 or a payload with no usable price
- **THEN** the method rejects with a `MarketDataError` whose `code === "NOT_FOUND"`

#### Scenario: Upstream error
- **WHEN** the underlying HTTP call returns HTTP 5xx or a non-retryable transport error
- **THEN** the method rejects with a `MarketDataError` whose `code === "UPSTREAM_ERROR"` (or `"NETWORK"` for transport failures)

### Requirement: Provider isolation from the read path

The system MUST allow provider implementations to live in `src/lib/market-data/<provider-name>.ts` and MUST be reachable only through a registry function `getMarketDataProvider(): MarketDataProvider` exported from `src/lib/market-data/registry.ts`. Route Handlers, Server Components, and dashboard code MUST import from `@/lib/market-data` (interface + registry) and MUST NOT import provider implementations directly.

#### Scenario: Consumer uses the registry
- **WHEN** a Server Component or Route Handler needs a market data operation
- **THEN** it calls `getMarketDataProvider()` rather than importing `YahooFinanceMarketDataProvider` directly

### Requirement: Yahoo Finance provider

The system SHALL ship a `YahooFinanceMarketDataProvider` registered as the default in the registry. The provider MUST call `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=6mo` for series and `?interval=2m&range=1d` for quotes, with a User-Agent header. Network failures MUST be retried once with a 2 s backoff before throwing `NETWORK`. Symbol resolution at the call site MUST be `assets.yahoo_symbol ?? assets.ticker`; if both are absent, the call site MUST short-circuit with `NOT_FOUND` without making an HTTP request.

#### Scenario: Provider returns the latest price
- **WHEN** `getQuote("AAPL")` is called and Yahoo returns a valid chart payload with `meta.regularMarketPrice = 192.34`
- **THEN** the method resolves with `price: 192.34, priceUsd: 192.34, observedAt: <meta.regularMarketTime as ISO>`

#### Scenario: 404 from Yahoo is normalized
- **WHEN** Yahoo returns HTTP 404 for an unknown symbol
- **THEN** the method rejects with `code: "NOT_FOUND"` (not `UPSTREAM_ERROR`)

#### Scenario: Payload missing the price field
- **WHEN** Yahoo returns HTTP 200 but `meta.regularMarketPrice` is `null` (delisted ticker, halted market)
- **THEN** the method rejects with `code: "NOT_FOUND"` so the sync loop skips the symbol without recording a hard error

### Requirement: FxRateProvider interface

The system SHALL expose an `FxRateProvider` interface in `src/lib/fx/provider.ts` with `getRate(fromCurrency: "USD" | "COP", toCurrency: "USD" | "COP"): Promise<FxRate>`. Rate responses MUST be validated with Zod. A rate `<= 0` MUST be rejected as `INVALID_PAYLOAD`.

#### Scenario: Successful rate retrieval
- **WHEN** a caller invokes `getRate("USD", "COP")` and the provider returns a valid payload
- **THEN** the method resolves with `{ fromCurrency: "USD", toCurrency: "COP", rate: number > 0, observedAt: ISO8601, source: string }`

#### Scenario: Zero or negative rate
- **WHEN** the validated payload contains `rate <= 0`
- **THEN** the method rejects with `code: "INVALID_PAYLOAD"`

### Requirement: open.er-api.com FX provider

The system SHALL ship an `OpenErApiFxRateProvider` registered as the default in `src/lib/fx/registry.ts`. The provider MUST call `https://open.er-api.com/v6/latest/{base}` with no API key. If the response omits the requested target currency, the provider MUST reject with `INVALID_PAYLOAD`.

#### Scenario: USD to COP lookup
- **WHEN** `getRate("USD", "COP")` is called and open.er-api.com returns `{ result: "success", base_code: "USD", time_last_update_unix: 1718000000, rates: { COP: 3950.12, ... } }`
- **THEN** the method resolves with `rate: 3950.12, observedAt: <ISO from time_last_update_unix>`

#### Scenario: Target currency missing
- **WHEN** the response payload has no `rates.COP` key
- **THEN** the method rejects with `code: "INVALID_PAYLOAD"`

