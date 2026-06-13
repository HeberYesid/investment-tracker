# Phase 3: Dashboard MVP Plan

## Goal

Build the consolidated dashboard with portfolio summary, distributions, time evolution, profitability, benchmark comparison placeholder, and drawdown.

## Scope

- Dashboard summary cards.
- Portfolio evolution chart.
- Distribution by broker, sector, and country.
- Profitability by stock, broker, month, and year.
- Drawdown chart.
- Snapshot calculation.

## Files And Areas

```txt
app/page.tsx
app/api/v1/dashboard/summary/route.ts
app/api/v1/dashboard/evolution/route.ts
app/api/v1/dashboard/distribution/route.ts
app/api/v1/dashboard/returns/route.ts
app/api/v1/dashboard/drawdown/route.ts
features/dashboard/
components/charts/
lib/calculations/
tests/unit/calculations/
tests/integration/dashboard/
```

## Tasks

- [x] Define dashboard DTO schemas.
- [x] Implement holdings calculation from trades.
- [x] Implement total equity calculation using latest available price or trade cost fallback.
- [x] Implement invested capital calculation.
- [x] Implement realized and unrealized P/L.
- [x] Implement return percentage.
- [x] Implement distribution calculations by broker, sector, and country.
- [x] Implement monthly/yearly profitability aggregation.
- [x] Implement drawdown calculation from portfolio value series.
- [x] Build dashboard API endpoints.
- [x] Build mobile-first dashboard UI with charts.
- [x] Add benchmark comparison UI with placeholder data until Phase 5.

## Calculation Rules

- Trades are the source of truth.
- Soft-deleted trades are ignored.
- If no market price exists, use latest trade price as fallback and mark the value as estimated.
- P/L must be calculated in USD.
- Distributions must use current position market value when available.
- Drawdown uses the portfolio value time series.

## Tests

- Unit test: holdings are correct after multiple buys and sells.
- Unit test: total equity uses latest price when available.
- Unit test: fallback equity uses trade price when market data is missing.
- Unit test: distribution percentages sum to 100 percent within rounding tolerance.
- Unit test: drawdown identifies peak-to-trough decline.
- Integration test: dashboard summary returns expected shape.

## Acceptance Criteria

- Dashboard shows total equity, P/L, return percentage, and distributions.
- Dashboard has charts for evolution, distribution, returns, and drawdown.
- Empty dashboard state works for a new user.
- Calculations are covered by tests.

## Cost Controls

- No real-time polling.
- Cache dashboard responses where possible.
- Calculate snapshots only when trades change or on scheduled daily refresh.

