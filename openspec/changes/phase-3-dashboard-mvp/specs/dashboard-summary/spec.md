## ADDED Requirements

### Requirement: Dashboard summary endpoint
The system SHALL expose `GET /api/v1/dashboard/summary` returning the user's portfolio totals in USD.

The response MUST include `equityUsd`, `investedUsd`, `realizedPnlUsd`, `unrealizedPnlUsd`, `totalPnlUsd`, `returnPct`, `holdingsCount`, and `isEstimated`.

The endpoint MUST compute values only from `trades` with `deleted_at IS NULL`.

The endpoint MUST mark `isEstimated: true` when at least one holding is priced using the trade-fallback path, and `isEstimated: false` only when every holding has a non-future `market_prices` row.

#### Scenario: Empty portfolio
- **WHEN** a request is made for a portfolio with zero active trades
- **THEN** the response returns `200` with all numeric fields equal to `0` and `holdingsCount: 0`

#### Scenario: Portfolio with active holdings
- **WHEN** a request is made for a portfolio with one BUY trade of 10 shares at USD 100 and no market data
- **THEN** the response returns `200` with `equityUsd: 1000`, `investedUsd: 1000`, `realizedPnlUsd: 0`, `unrealizedPnlUsd: 0`, `totalPnlUsd: 0`, `returnPct: 0`, `holdingsCount: 1`, and `isEstimated: true`

#### Scenario: Validation failure
- **WHEN** the request includes a query parameter that fails Zod validation
- **THEN** the response returns `422` with the standard error shape

### Requirement: Dashboard summary UI section
The system SHALL render a "Resumen" section on the home route (`/`) that displays four KPI cards in this order: `Equity total`, `Capital invertido`, `Ganancia / Pérdida`, and `Rentabilidad %`.

The section MUST show a yellow banner reading "Valores estimados" when `isEstimated` is `true`.

The section MUST show a friendly empty state with a heading, a description, and two CTAs ("Registrar operación" linking to `/trades/new` and "Importar CSV" linking to `/import`) when `holdingsCount` is `0`.

#### Scenario: User with no trades
- **WHEN** the home route loads for a user with no trades
- **THEN** the empty state is visible and the four KPI cards are not rendered

#### Scenario: User with trades
- **WHEN** the home route loads for a user with at least one active trade
- **THEN** the four KPI cards are visible with USD-formatted values and the estimated banner is visible

#### Scenario: Mobile viewport
- **WHEN** the dashboard is rendered on a viewport narrower than 640px
- **THEN** the four KPI cards stack vertically and remain readable
