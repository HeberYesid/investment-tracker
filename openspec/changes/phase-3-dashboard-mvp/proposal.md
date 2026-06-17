## Why

Phases 0–2 delivered the data foundation, manual trade entry, and CSV import across eToro, XTB, Trii, and eTrading Bancolombia. Today the home route (`/`) is a static marketing shell that hard-codes `USD 0.00` for total equity. With trades already being persisted in USD, we now have enough information to surface real portfolio metrics: equity, P/L, return %, and distributions. The dashboard is the first screen a user opens in a tracking app, so it is the highest-leverage deliverable in the MVP, and it is the only way to validate that the trade model from phases 1 and 2 can actually answer "how is my portfolio doing?."

## What Changes

- Add a new `dashboard` feature module with mobile-first summary cards, evolution chart, distribution chart, and returns table.
- Replace the static home route (`src/app/page.tsx`) with the new dashboard. The current hero copy and "USD 0.00" placeholder are removed.
- Add four new GET endpoints under `/api/v1/dashboard/`: `summary`, `distribution`, `evolution`, `returns`.
- Introduce seven pure calculation modules under `src/lib/calculations/` (`holdings`, `pricing`, `equity`, `pnl`, `distribution`, `evolution`, `returns-aggregation`) that the API endpoints consume. These are unit-tested in isolation.
- Add a `dashboard-loader` that fetches trades (with asset and broker joins) and the latest market price per asset in a single coordinated read.
- Add Recharts-based chart components under `src/components/charts/`, plus a `BenchmarkPlaceholder` card that states "Disponible en Fase 5" until market data lands.
- Add a Spanish i18n dictionary `src/lib/i18n/dashboard.ts` and wire it through every new component. No English in this phase.
- Add Zod DTO schemas for the new API request and response shapes under `src/lib/validations/dashboard.ts`.
- Update the existing `src/app/page.test.tsx` and `tests/e2e/home.spec.ts` to assert the new dashboard shell.

## Capabilities

### New Capabilities
- `dashboard-summary`: equity, invested capital, realized and unrealized P/L, return %, holdings count, and the `isEstimated` flag (true until market data lands in Phase 5).
- `portfolio-evolution`: time series of portfolio value from first trade to today, default granularity `monthly`, with optional `daily`.
- `portfolio-distribution`: value and percentage breakdown by `broker`, `sector`, or `country`, with a "Sin clasificar" bucket when asset metadata is missing.
- `portfolio-returns`: profitability aggregated by `month`, `year`, `stock`, or `broker` with realized, unrealized, and return %.
- `dashboard-api`: shared contract for the four new GET endpoints (auth-less for now, query validation, error shape).

### Modified Capabilities
- None. No existing spec-level behavior changes; this change only adds new capabilities. The home route change is a full replacement, not a behavioral change to any existing capability.

## Impact

- **New code**: ~30 new files across `src/lib/calculations/`, `src/lib/validations/`, `src/lib/dashboard/`, `src/app/api/v1/dashboard/`, `src/components/charts/`, `src/features/dashboard/`, `src/lib/i18n/`, plus unit and integration tests.
- **Modified code**: `src/app/page.tsx` (full replacement), `src/app/page.test.tsx`, `tests/e2e/home.spec.ts`, `docs/investment-tracker/phases/03-dashboard-mvp.md` (task checkboxes), `README.md` (phase status).
- **APIs**: 4 new GET endpoints under `/api/v1/dashboard/*`. No existing endpoint changes.
- **Database**: no schema changes. `market_prices` is read but will be empty in this phase, so the fallback price path is the one that runs in production. `portfolio_snapshots` is not written to in this phase.
- **Dependencies**: Recharts is already installed and used by no one yet; no new packages required.
- **Cost**: still USD 0/month. No new external services. All calculations run on demand from existing Supabase queries.
- **Auth**: still none. Service-role Supabase client is used in the API routes, identical to existing trade routes.
