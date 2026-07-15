# portfolio-returns Specification

## Purpose

Portfolio returns endpoint and table UI showing profitability grouped by month, year, stock, or broker.

## Requirements

### Requirement: Portfolio returns endpoint

The system SHALL expose `GET /api/v1/dashboard/returns` returning aggregated profitability.

The query MUST accept `groupBy` with values `month` (default), `year`, `stock`, and `broker`.

The response MUST include `groupBy` and `rows: { key: string, label: string, realizedPnlUsd: number, unrealizedPnlUsd: number, totalPnlUsd: number, returnPct: number }[]`, sorted in descending order of `totalPnlUsd`.

`returnPct` for a row MUST be `totalPnlUsd / max(investedForRow, 1) * 100`, where `investedForRow` is the USD cost basis attributed to that grouping. Rows with zero invested MUST return `returnPct: 0`.

#### Scenario: Monthly aggregation
- **WHEN** a request is made with `groupBy=month` for a portfolio with trades in two calendar months
- **THEN** the response returns two rows keyed by `YYYY-MM`, each with non-zero `realizedPnlUsd` or `unrealizedPnlUsd` reflecting trades in that month

#### Scenario: Stock aggregation sorted descending
- **WHEN** a request is made with `groupBy=stock` for a portfolio with three distinct tickers
- **THEN** the response returns three rows sorted by `totalPnlUsd` descending

#### Scenario: Invalid groupBy
- **WHEN** a request is made with `groupBy=quarter`
- **THEN** the response returns `422` with the standard error shape

### Requirement: Portfolio returns table UI

The system SHALL render a "Rentabilidad" section on the home route with a `groupBy` selector and a table of the rows from the returns endpoint.

The table MUST show the four numeric columns (`P/L realizado`, `P/L no realizado`, `Total`, `Rentabilidad %`) and the label column. Numeric values MUST be USD-formatted. Percentages MUST use the Spanish locale with one decimal.

#### Scenario: User switches grouping
- **WHEN** the user selects "Por bróker" after viewing "Mensual"
- **THEN** the table updates to show one row per broker with the same column shape

#### Scenario: Empty returns
- **WHEN** the endpoint returns `rows: []`
- **THEN** the table shows a friendly empty state and does not render the table headers
