# dashboard-server-loading Specification

## Purpose
TBD - created by archiving change performance-high-impact. Update Purpose after archive.
## Requirements
### Requirement: Dashboard server-rendered with single aggregated data load

The dashboard route `src/app/page.tsx` MUST be an async Server Component that resolves the current user/portfolio server-side and renders dashboard content with real data in the initial HTML. It MUST call a single server function `loadDashboardAggregate()` that executes `loadDashboardData` exactly once per request and computes the summary, evolution, returns and snapshot payloads in-process, reusing a single computed `holdings` array. The served HTML MUST NOT render a generic "Cargando…" placeholder as the primary content; it MUST contain the summary cards and (once client JS hydrates) mount the charts. The `/avanzado` route MUST follow the same single-load pattern for its snapshot payload.

#### Scenario: Authenticated user loads the dashboard
- **WHEN** an authenticated user requests `/` and their portfolio has trades and market prices
- **THEN** the server-rendered HTML contains the `SummaryCards` with computed equity/PnL values and no client-side loading state is shown for the summary

#### Scenario: Empty portfolio
- **WHEN** an authenticated user with no trades requests `/`
- **THEN** the server-rendered HTML shows the empty-state call-to-action (no `fetch` waterfall)

#### Scenario: Charts hydrate after JS
- **WHEN** the dashboard HTML arrives with summary data and the client bundle loads
- **THEN** the `EvolutionChart` (and `BenchmarkChart`/`DistributionChart` on `/avanzado`) mount via `next/dynamic` with the data already available as props, without re-fetching

### Requirement: Aggregated dashboard endpoint for client reload

The system MUST expose `GET /api/v1/dashboard/aggregate` that returns a single JSON body `{ summary, evolution, returns, snapshot }` computed with one `loadDashboardData` call. The client reload hook (`useDashboardData`/`useAdvancedData`) MUST use this single endpoint instead of 4–5 parallel fetches. The response MUST include `Cache-Control: private, s-maxage=30, stale-while-revalidate=60`. The previously existing endpoints (`/api/v1/dashboard/{summary,evolution,returns,snapshot}`) MUST remain functional but are deprecated.

#### Scenario: Client reload issues one request
- **WHEN** the user triggers a dashboard reload (e.g. retry button)
- **THEN** exactly one `fetch` to `/api/v1/dashboard/aggregate` is issued and all four payloads update together

#### Scenario: Aggregate response shape
- **WHEN** `/api/v1/dashboard/aggregate` is called by an authenticated user
- **THEN** the JSON contains `summary`, `evolution`, `returns`, and `snapshot` keys each matching the shape of the corresponding legacy endpoint

### Requirement: Dashboard market data caching with invalidation

`loadLatestMarketPrices` and `loadBenchmarkSeries` MUST be wrapped with `unstable_cache` keyed by the sorted set of asset ids (NOT by `portfolioId`, since market/benchmark data is global). The cache MUST have a TTL of 60 seconds and tags `["market-prices"]` and `["benchmark"]` respectively. Trade mutations (`POST`/`PATCH`/`DELETE` on `/api/v1/trades` and `/api/v1/trades/[id]`) and CSV commit (`/api/v1/imports/csv/commit`) MUST call `revalidatePath("/")` and `revalidatePath("/avanzado")`. The sync-prices and sync-fx-rates flows MUST invalidate the `market-prices` and `benchmark` tags via an internal invalidation endpoint.

#### Scenario: Repeated dashboard loads within TTL reuse cached prices
- **WHEN** two dashboard loads happen within 60 seconds for portfolios sharing asset ids
- **THEN** `loadLatestMarketPrices` performs at most one Supabase query across both loads

#### Scenario: Trade mutation invalidates the dashboard path
- **WHEN** a user creates, edits or deletes a trade
- **THEN** `revalidatePath("/")` and `revalidatePath("/avanzado")` are called so the next dashboard load reflects the change

#### Scenario: Price sync invalidates the market-prices cache
- **WHEN** the sync-prices cron completes
- **THEN** the `market-prices` cache tag is invalidated so subsequent dashboard loads fetch fresh prices

### Requirement: SummaryCards rendered server-side

`src/components/charts/summary-cards.tsx` MUST NOT carry a `"use client"` directive (it is presentational with no hooks/state/handlers) so that it is server-rendered as part of the dashboard HTML.

#### Scenario: SummaryCards is a server component
- **WHEN** the dashboard Server Component renders `SummaryCards` with a summary payload
- **THEN** the cards appear in the initial server-rendered HTML without requiring client JS
