## ADDED Requirements

### Requirement: Portfolio evolution endpoint
The system SHALL expose `GET /api/v1/dashboard/evolution` returning a time series of portfolio value.

The query MUST accept `granularity` with values `monthly` (default) or `daily`, and optional `from` and `to` date strings in `YYYY-MM-DD` format.

The response MUST include `points: { date: string, valueUsd: number }[]` sorted in ascending date order, plus the resolved `granularity` and the `from`/`to` window that was applied.

The series MUST be computed from active trades only. The value at any point in the series MUST be the USD market value of the holdings owned at that point in time, using the most recent trade price as a fallback when no market price is available.

#### Scenario: Default monthly granularity
- **WHEN** a request is made with no query parameters
- **THEN** the response returns points at the last day of each month from the first trade month up to the current month

#### Scenario: Empty portfolio
- **WHEN** a request is made for a portfolio with zero active trades
- **THEN** the response returns `200` with `points: []` and the requested `granularity`

#### Scenario: Invalid granularity
- **WHEN** a request is made with `granularity=hourly`
- **THEN** the response returns `422` with the standard error shape

### Requirement: Portfolio evolution chart UI
The system SHALL render a line/area chart titled "Evolución del portafolio" on the home route showing the time series from the evolution endpoint.

The chart MUST display a USD-formatted Y axis and a localized date X axis. It MUST show a loading skeleton while the endpoint is in flight and MUST hide itself if `points` is empty.

The chart MUST render a footnote "Valores estimados a partir de los precios de tus operaciones" when the summary endpoint reports `isEstimated: true`.

#### Scenario: Empty evolution
- **WHEN** the evolution endpoint returns `points: []`
- **THEN** the chart section is not rendered

#### Scenario: Multi-month evolution
- **WHEN** the evolution endpoint returns at least two points spanning at least two calendar months
- **THEN** the chart renders a line with one marker per point and a USD-formatted Y axis
