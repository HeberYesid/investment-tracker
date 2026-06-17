## ADDED Requirements

### Requirement: Market data snapshot endpoint

The system MUST expose `GET /api/v1/market-data/snapshot` that returns a JSON body with the shape:

```
{
  "quotes": [
    { "assetId": uuid, "ticker": string, "priceUsd": number, "observedAt": ISO, "isStale": boolean, "source": "MARKET" | "TRADE_FALLBACK" }
  ],
  "fxCopToUsd": { "rate": number, "observedAt": ISO, "isStale": boolean } | null,
  "benchmark": { "symbol": "^GSPC", "series": [{ "t": ISO, "value": number }] } | null
}
```

`quotes` MUST contain one entry per asset with `quantity > 0` in the caller's current portfolio, ordered by ticker. `fxCopToUsd` MUST be the latest `fx_rates` row for `('USD','COP')` or `null` if none exists. `benchmark.series` MUST be the S&P 500 series normalized so the first point equals 100; if no benchmark rows exist in `market_prices`, the field MUST be `null`. A quote or rate is `isStale` when its `observed_at` is older than 2 h (quotes) or 24 h (FX).

#### Scenario: Snapshot for a portfolio with active holdings
- **WHEN** an authenticated user with three open positions hits the endpoint and `market_prices` has fresh rows for two of them plus a stale row for the third
- **THEN** the response contains three quotes, two with `isStale: false` and one with `isStale: true`

#### Scenario: Empty portfolio
- **WHEN** an authenticated user with no trades hits the endpoint
- **THEN** `quotes` is `[]`, `fxCopToUsd` is the latest USD/COP rate (or `null`), and `benchmark` is the S&P 500 series (or `null`)

#### Scenario: Unauthenticated request
- **WHEN** the request has no session cookie
- **THEN** the endpoint returns HTTP 401 with `{ error: { code: "UNAUTHORIZED", message: "No autenticado." } }`

### Requirement: Dashboard staleness badges

`SummaryCards` MUST show a "Precio estimado" badge in Spanish when at least one holding has no `market_prices` row (estimated equity). It MUST also show a "Precio desactualizado" badge when at least one quote in the snapshot has `isStale: true`. `DistributionChart` rows MUST show a clock-icon with `observedAt` as a tooltip for market-priced rows and a dotted "≈" prefix for estimated rows. All copy MUST live in `src/lib/i18n/dashboard.ts`.

#### Scenario: Mixed estimated and market data
- **WHEN** the snapshot contains two market quotes (one stale) and one estimated row
- **THEN** `SummaryCards` shows both badges, and `DistributionChart` shows the clock icon on the market row and the "≈" prefix on the estimated row

#### Scenario: All data fresh
- **WHEN** every holding has a market quote and none are stale
- **THEN** neither badge is shown and `DistributionChart` renders without clock icons or "≈" prefixes

### Requirement: S&P 500 benchmark chart

`BenchmarkChart` MUST replace `BenchmarkPlaceholder` in the dashboard. The chart MUST overlay the S&P 500 normalized series (first point = 100) against the existing `EvolutionChart` portfolio series on a shared time axis. When `benchmark` is `null` in the snapshot, the chart MUST render a Spanish message "El benchmark aún no se ha sincronizado" with a "Sincronizar ahora" button visible only in development mode.

#### Scenario: Benchmark series available
- **WHEN** the snapshot contains a benchmark series
- **THEN** the dashboard renders two lines (portfolio and S&P 500) on a single chart with a legend

#### Scenario: Benchmark not yet synced
- **WHEN** the snapshot has `benchmark: null`
- **THEN** the dashboard shows the "no sincronizado" message and, in development, a button that calls `POST /api/v1/admin/sync/run` with `{ kind: "PRICES" }`

### Requirement: Trade form COP pre-fill

`TradeForm` MUST, on mount and whenever the user toggles `currency_original` to `"COP"`, fetch the latest FX from `useLatestFxRate()` (a TanStack Query hook over the snapshot endpoint). If a non-stale rate exists, the field `fx_rate_to_usd` is pre-filled with the rate; a read-only hint shows "Actualizado: <observedAt>". If the rate is stale, the field is left empty and a Spanish hint shows "La tasa disponible está desactualizada; ingresa la tasa actual." If no rate exists, the hint shows "Sin tasa reciente; ingresa la tasa actual." The user MUST always be able to override the pre-filled value and submit normally.

#### Scenario: Fresh FX is pre-filled
- **WHEN** the user opens the form and selects `currency_original = COP` and the latest FX is `< 24 h` old
- **THEN** `fx_rate_to_usd` shows the rate and a read-only line shows "Actualizado: <fecha>"

#### Scenario: Stale FX is not pre-filled
- **WHEN** the latest FX is `> 24 h` old
- **THEN** the field is empty, a hint says "La tasa disponible está desactualizada; ingresa la tasa actual.", and the existing Zod rule (fx_rate_to_usd != 1 for COP) still applies on submit

#### Scenario: User overrides the pre-filled value
- **WHEN** the user changes `fx_rate_to_usd` after pre-fill
- **THEN** the form submits with the user-typed value and the original pre-filled value is not restored

#### Scenario: USD trade is unaffected
- **WHEN** the user picks `currency_original = USD`
- **THEN** `useLatestFxRate` is not invoked and the FX field is not shown (existing behavior preserved)
