# Phase 5: Market Data And FX Plan

## Goal

Add delayed market prices, benchmark comparison, and automatic COP to USD conversion through free providers.

## Scope

- Market data adapter.
- FX rate adapter.
- Scheduled price sync.
- Scheduled FX sync.
- Benchmark comparison.
- Dashboard updates using real market prices.

## Files And Areas

```txt
lib/market-data/
lib/fx/
supabase/functions/sync-prices/
supabase/functions/sync-fx-rates/
app/api/v1/prices/route.ts
tests/unit/market-data/
tests/unit/fx/
tests/integration/prices/
```

## Provider Interfaces

```ts
export interface MarketDataProvider {
  getQuote(symbol: string): Promise<MarketQuote>;
  getBenchmark(symbol: string, range: DateRange): Promise<BenchmarkPoint[]>;
}

export interface FxRateProvider {
  getRate(fromCurrency: 'COP', toCurrency: 'USD', date: Date): Promise<FxRate>;
}
```

## Tasks

- [x] Implement provider interfaces.
- [x] Implement Yahoo Finance provider behind `MarketDataProvider`.
- [x] Implement free FX provider behind `FxRateProvider`.
- [x] Validate third-party responses with Zod.
- [x] Store quotes in `market_prices`.
- [x] Store rates in `fx_rates`.
- [x] Build scheduled Supabase Edge Function for quote refresh.
- [x] Build scheduled Supabase Edge Function for FX refresh.
- [x] Add benchmark comparison to dashboard.
- [x] Add stale-data indicators in the UI.

## Refresh Strategy

- Run quote sync every 30 minutes for active holdings.
- Batch symbols to avoid unnecessary function invocations.
- Do not poll from the browser.
- Keep latest quote per asset easily queryable.
- Store historical points only as needed for charts.

## Tests

- Unit test: provider response parser rejects malformed quote payloads.
- Unit test: FX conversion applies correct rate.
- Unit test: stale quote is marked as stale.
- Integration test: price sync inserts market price rows.
- Integration test: dashboard uses market price when available.

## Acceptance Criteria

- Dashboard uses delayed market prices.
- COP trades can be automatically converted to USD.
- Benchmark comparison works for configured benchmark symbols.
- Third-party response parsing is validated.

## Cost Controls

- No paid market data API.
- No browser polling.
- No per-user scheduled jobs.
- One global batch sync for active assets.
- Keep sync frequency conservative to stay inside Supabase Free Edge Function limits.

