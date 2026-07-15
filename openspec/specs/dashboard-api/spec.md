# dashboard-api Specification

## Purpose

API contract and data loader conventions for all dashboard endpoints.

## Requirements

### Requirement: Dashboard API contract

The system SHALL expose all dashboard endpoints under the `/api/v1/dashboard/` prefix as `GET` handlers. The contract for every endpoint MUST be:

- Query parameters validated with Zod at the route boundary.
- A `200` response on success with a JSON body whose top-level keys are stable.
- A `422` response on Zod validation failure with the shape `{ error: "Error de validación", details: <zod issues> }`.
- A `400` response for known business errors (e.g., unknown `portfolio_id`) with the shape `{ error: <message> }`.
- A `500` response for unhandled server errors with the shape `{ error: "Error interno del servidor" }`.

The endpoints MUST be implemented in `src/app/api/v1/dashboard/<endpoint>/route.ts` and MUST use `createServerSupabaseClient()` from `src/lib/supabase/server.ts`. They MUST use the helpers in `src/lib/api/errors.ts` (`badRequest`, `validationError`, `serverError`) and MUST NOT roll their own response shapes.

#### Scenario: A dashboard endpoint returns 422 on bad input
- **WHEN** any dashboard endpoint receives a query that fails its Zod schema
- **THEN** the response is `422` with `{ error: "Error de validación", details: ... }`

#### Scenario: A dashboard endpoint returns 500 on unhandled error
- **WHEN** a dashboard endpoint throws an unhandled exception
- **THEN** the response is `500` with `{ error: "Error interno del servidor" }` and no stack trace is leaked to the client

### Requirement: Dashboard data loader

The system SHALL provide a `loadDashboardData(portfolioId)` helper in `src/lib/dashboard/loader.ts` that returns a `DashboardData` bundle containing:

- `trades`: all active trades for the portfolio, with `assets` (ticker, name, sector, country) and `brokers` (name, code) joined.
- `latestMarketPrices`: a map keyed by `asset_id` with the most recent `market_prices` row whose `delayed_until` is `NULL` or `<= now()`.

The helper MUST issue the minimum number of queries needed to assemble the bundle (target: three queries — trades, market_prices, assets — with `in()` filters where applicable). The helper MUST NOT call `portfolio_snapshots` in this phase.

#### Scenario: Portfolio with no trades
- **WHEN** `loadDashboardData(portfolioId)` is called for an empty portfolio
- **THEN** the bundle contains an empty `trades` array and an empty `latestMarketPrices` map

#### Scenario: Portfolio with trades and no market data
- **WHEN** `loadDashboardData(portfolioId)` is called for a portfolio that has trades and no `market_prices` rows
- **THEN** the bundle contains the trades and an empty `latestMarketPrices` map
