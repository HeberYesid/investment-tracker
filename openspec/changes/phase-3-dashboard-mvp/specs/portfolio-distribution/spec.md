## ADDED Requirements

### Requirement: Portfolio distribution endpoint
The system SHALL expose `GET /api/v1/dashboard/distribution` returning a value and percentage breakdown of the current portfolio.

The query MUST accept `dim` with values `broker` (default), `sector`, or `country`.

The response MUST include `dim`, `totalUsd`, `slices: { key: string, label: string, valueUsd: number, percent: number, holdingsCount: number }[]`, and `unclassified` (a flag indicating whether any slice uses the "Sin clasificar" label).

The percentages MUST sum to exactly `100.00` within a ±0.01 tolerance. The slice with the largest value absorbs the rounding residual so the sum is exact.

The slice labeled "Sin clasificar" MUST be used for any holding whose asset lacks the corresponding metadata (`broker` falls back to its code only when the broker name is unknown; `sector`/`country` use the asset's `sector`/`country` and fall back to "Sin clasificar" when null).

#### Scenario: Broker distribution
- **WHEN** a request is made with `dim=broker` for a portfolio with positions on two brokers
- **THEN** the response returns exactly two slices, one per broker, with `percent` values that sum to `100.00` within ±0.01

#### Scenario: Country distribution with missing metadata
- **WHEN** a request is made with `dim=country` for a portfolio where every holding's asset has `country IS NULL`
- **THEN** the response returns a single slice with `label: "Sin clasificar"`, `valueUsd` equal to the total portfolio value, `percent: 100`, and `unclassified: true`

#### Scenario: Invalid dimension
- **WHEN** a request is made with `dim=currency`
- **THEN** the response returns `422` with the standard error shape

### Requirement: Portfolio distribution chart UI
The system SHALL render a "Distribución" section on the home route with a `dim` selector offering `Bróker`, `Sector`, and `País` and a pie chart of the current distribution.

The selector MUST be a single-select control and the chart MUST update without a full page reload when the user changes the dimension.

When `unclassified` is `true`, the section MUST show an info tooltip "El detalle por sector/país se enriquece con datos de mercado en Fase 5."

#### Scenario: User switches dimension
- **WHEN** the user selects "Sector" after viewing "Bróker"
- **THEN** the chart and the slice list update to the sector distribution within the same dashboard view

#### Scenario: All holdings unclassified
- **WHEN** the distribution endpoint returns `unclassified: true`
- **THEN** the chart renders a single "Sin clasificar" slice and the info tooltip is visible
