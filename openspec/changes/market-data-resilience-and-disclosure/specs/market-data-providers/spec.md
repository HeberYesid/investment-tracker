## MODIFIED Requirements

### Requirement: Provider isolation from the read path

The system MUST allow provider implementations to live in `src/lib/market-data/<provider-name>.ts` and MUST be reachable only through a registry function `getPriceProvider(): PriceProvider` exported from `src/lib/market-data/registry.ts`. The function MUST return a `CompositeProvider` (defined in `src/lib/market-data/composite.ts`) that wraps a list of concrete providers. The composite itself MUST implement the same `PriceProvider` interface so consumers (Route Handlers, Server Components, Edge Functions, dashboard code) MUST import from `@/lib/market-data` (interface + registry) and MUST NOT import provider implementations (Yahoo, Stooq, Composite) directly. The composite MUST be transparent to consumers — the consumer's code MUST NOT change when a new fallback provider is added to the composite.

#### Scenario: Consumer uses the registry

- **WHEN** a Server Component, Route Handler, or Edge Function needs a market data operation
- **THEN** it calls `getPriceProvider()` rather than importing `YahooProvider`, `StooqProvider`, or `CompositeProvider` directly

#### Scenario: New fallback added without consumer change

- **WHEN** a new fallback provider (e.g. an AlphaVantage provider) is added to the composite's list
- **THEN** no consumer code outside `src/lib/market-data/composite.ts` needs to change; the new provider is automatically consulted when the existing ones fail

## ADDED Requirements

### Requirement: Composite is the registry default

The registry function `getPriceProvider()` MUST return a `CompositeProvider` instance constructed with `[YahooProvider, StooqProvider]` in that order. The order is significant: the first provider that returns a valid quote wins. The composite MUST log which provider produced each quote to the Edge Function's structured log so the breakdown (e.g. `yahoo_ok=12, stooq_fallback=3`) can be recorded in `market_sync_runs.error` for observability.

#### Scenario: Registry returns composite

- **WHEN** `getPriceProvider()` is called from any consumer
- **THEN** the returned object is a `CompositeProvider` whose `fetchQuotes` method orchestrates the configured providers in order

#### Scenario: Provider breakdown is logged

- **WHEN** the Edge Function `sync-prices` finishes a batch using the composite
- **THEN** the final `market_sync_runs.error` string (when the run was a `SUCCESS`) is formatted as `"yahoo_ok=N,stooq_fallback=M"` where N and M are the counts of quotes served by each provider; when the run is a `FAILED` the existing error string is preserved
