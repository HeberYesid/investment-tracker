## ADDED Requirements

### Requirement: Portfolio drawdown endpoint
The system SHALL expose `GET /api/v1/dashboard/drawdown` returning the running peak-to-trough drawdown of the portfolio value series.

The response MUST include `series: { date: string, valueUsd: number, peakUsd: number, drawdownPct: number }[]` sorted in ascending date order, plus `maxDrawdownPct` (a single number, the most negative value in the series, or `0` if the series never falls below its peak).

The `drawdownPct` for a point MUST be `(valueUsd - peakUsd) / peakUsd * 100` and MUST be ≤ `0` for every point in the series.

#### Scenario: Series that never falls below its starting value
- **WHEN** a request is made for a portfolio whose value series is monotonically non-decreasing
- **THEN** the response returns `maxDrawdownPct: 0` and every point has `drawdownPct: 0`

#### Scenario: Series with a peak-to-trough decline
- **WHEN** a request is made for a portfolio whose value rises from USD 1000 to USD 1500 and then falls to USD 1200
- **THEN** the response includes a point with `valueUsd: 1200`, `peakUsd: 1500`, `drawdownPct: -20`, and `maxDrawdownPct: -20`

#### Scenario: Empty series
- **WHEN** a request is made for a portfolio with zero active trades
- **THEN** the response returns `200` with `series: []` and `maxDrawdownPct: 0`

### Requirement: Portfolio drawdown chart UI
The system SHALL render a "Drawdown" section on the home route with an area chart of the drawdown series.

The chart MUST render the area below zero in red and the X axis with a localized date format. The section MUST show a friendly empty state when `series` is empty and MUST not render the chart axes in that case.

The section MUST also display the `maxDrawdownPct` value as a single number formatted as a Spanish-locale percentage with one decimal, prefixed with a minus sign when negative.

#### Scenario: Empty drawdown
- **WHEN** the drawdown endpoint returns `series: []`
- **THEN** the chart is hidden and a message "Aún no hay datos de drawdown" is visible

#### Scenario: Negative drawdown visible
- **WHEN** the drawdown endpoint returns a `maxDrawdownPct` of `-20`
- **THEN** the chart area below zero is rendered in red and the headline reads `Drawdown máximo: -20,0 %`
