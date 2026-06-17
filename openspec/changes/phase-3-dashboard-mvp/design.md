## Context

Phases 0–2 of the investment tracker produced a working trade ledger: schema with RLS, four broker seeds, a trades CRUD under `/api/v1/trades`, and a CSV import pipeline under `/api/v1/imports/csv/*`. Every trade is stored with both the original currency and the USD-normalized fields (`price_usd`, `commission_usd`, `total_invested_usd`), so the data layer is already USD-ready. The home route today is a static shell that hard-codes `USD 0.00` and shows marketing copy.

`docs/investment-tracker/phases/03-dashboard-mvp.md` is the authoritative spec for this phase. It defines four chart sections (summary cards, evolution, distribution, returns) and an explicit "benchmark placeholder" deferred to Phase 5. The market_prices table exists but is empty, so the design must work in an "estimated" mode where the only available price is the last trade price for each asset.

The repo is Next.js 15 (App Router) + React 19 + Supabase Postgres + Vitest + Playwright. Recharts 3 is already a dependency. TanStack Query 5 is installed but unused; the rest of the codebase uses `fetch` + `useState`/`useEffect`. Spanish is the only locale for this phase.

## Goals / Non-Goals

**Goals:**
- Replace `src/app/page.tsx` with a real dashboard that shows equity, P/L, return %, distributions, evolution, and returns.
- Pure, isolated calculation modules under `src/lib/calculations/` that the API endpoints consume and that are unit-tested independently of the database.
- Four GET endpoints under `/api/v1/dashboard/*` with Zod query validation and the same error shape as existing endpoints.
- Mobile-first UI built from the existing shadcn-style primitives (Button) and Recharts.
- A clear "Sin clasificar" bucket for sector/country distributions, with a tooltip explaining that asset metadata will be enriched in Phase 5.
- A `BenchmarkPlaceholder` card that explicitly states the comparison is "Disponible en Fase 5" so the gap is visible to the user.

**Non-Goals:**
- No persistence to `portfolio_snapshots` in this phase. Snapshots are recomputed from trades on every request.
- No new auth. Service-role Supabase client is used, identical to existing trade routes.
- No cron, no scheduled refresh, no real-time polling.
- No edits to existing API contracts, schema, or trade CRUD.
- No sector/country enrichment UI; assets keep the `STOCK`-only defaults from phase 1.
- No English locale.
- No PDF/Excel export (Phase 7).
- No TanStack Query migration; UI keeps the existing `fetch` + `useState` pattern for consistency.

## Decisions

**D1. Pure calculation modules first, API and UI second.**
- Why: Financial math drifts if it is buried inside route handlers or React components. Keeping the math in `src/lib/calculations/*.ts` with no I/O lets us unit-test the precision of totals and distribution rounding in isolation. The API layer is then a thin translation from `trades` rows to calculation inputs.
- Alternative considered: put math inline in route handlers. Rejected because it makes the test surface as wide as Supabase, which is the failure mode phases 0–2 have been carefully avoiding.

**D2. Price resolution: latest non-future market price or trade-price fallback.**
- The `market_prices` table is empty in this phase, so almost every asset falls back to the price of the most recent trade in USD. The fallback is computed in `pricing.ts` as `resolveAssetPrice(assetId, marketPrices, trades)` and returns `{ priceUsd, isEstimated, source: 'MARKET' | 'TRADE_FALLBACK' }`.
- The summary endpoint exposes an `isEstimated` flag. The UI shows a yellow banner "Valores estimados — los precios se actualizarán con datos de mercado en Fase 5" when true.
- Alternative considered: refuse to compute equity without market data. Rejected because the user has trades in the system and seeing `USD 0.00` is worse than seeing an estimated value with a clear caveat.

**D3. `evolution` defaults to `monthly` granularity.**
- With dozens of trades and a daily granularity, the chart would have one point per day, which on mobile compresses into noise. Monthly gives a useful time series for portfolios in the 6–24 month range that the MVP targets. The endpoint accepts an optional `granularity=daily` for power users.
- Alternative considered: weekly. Rejected because monthly maps cleanly to the returns table's `groupBy=month`.

**D4. `portfolio_snapshots` is read but not written.**
- The loader queries `portfolio_snapshots` only to detect existing snapshot dates for an internal "is this point already computed" cache hint; in this phase it has no rows, so the loader is functionally a no-op for that step.
- The loader writes nothing. All series calculations are derived live from the `trades` table.
- Alternative considered: write a snapshot on every trade mutation. Rejected because it complicates the trade CRUD path and the calc cost on Supabase Free is still tiny for the trade volumes this MVP supports.

**D5. Distribution rounding is absorbed by the largest slice.**
- A naive `slice.valueUsd / total * 100` rounds to 99.99 or 100.01 when summed. The `distribution` module applies `Math.round` and then assigns the residual to the slice with the largest value so the percentages always sum to exactly 100.00 (±0.01 tolerance for tests).
- Alternative considered: keep a separate "other" bucket for residual. Rejected because the user sees the actual slices without an artificial "other" line that is just rounding noise.

**D6. Sector/country unknown → "Sin clasificar" + tooltip.**
- The asset insert path in the existing `POST /api/v1/trades` route does not set `sector` or `country`. Rather than gate the distribution chart, the response includes a `Sin clasificar` slice with a `missingCount` field. The chart shows a dashed border and the section header has a tooltip "El detalle por sector/país se enriquece con datos de mercado en Fase 5."
- Alternative considered: build an asset-edit UI. Rejected — out of scope for this phase, and the user still gets a working distribution by broker.

**D7. Loader returns a single `DashboardData` bundle.**
- The five endpoints all need the same underlying data (active trades joined with assets and brokers, plus latest market price per asset). A `loadDashboardData(portfolioId)` helper in `src/lib/dashboard/loader.ts` runs three queries: `trades` (with `assets` and `brokers` joins), `market_prices` (latest non-future per asset), and `assets` (for sector/country metadata). Each endpoint narrows that bundle to its slice of work.
- Alternative considered: per-endpoint queries. Rejected because the same data is requested five times in a single page load.

**D8. UI keeps the existing `fetch` + `useState` pattern, no TanStack Query.**
- The existing `trades-page-client.tsx` and `import-history.tsx` use plain `fetch` and local state. Introducing TanStack Query only on the dashboard would create a split that future migrations would have to clean up. We use the same pattern, then the dashboard client loads all five endpoints in a single `useEffect` and exposes one `dashboard` state object with `loading`, `error`, and the five payload slices.
- Alternative considered: per-section loaders with suspense. Rejected — adds complexity without changing user-visible behavior.

**D9. Single i18n dictionary for the entire dashboard.**
- A new `src/lib/i18n/dashboard.ts` follows the existing `getTradeLabels()` pattern. It exports a single `dashboardLabels.es` object with all keys used by `dashboard-page-client.tsx` and the chart components. No nested namespaces — flat object, easy to grep.
- Alternative considered: per-chart dictionaries. Rejected because labels cross chart boundaries (e.g., "USD" formatting is shared).

**D10. Empty state and loading skeleton are first-class.**
- The dashboard client distinguishes three states: `loading` (skeleton placeholders shaped like the real cards), `empty` (no trades, friendly message + "Registrar operación" / "Importar CSV" CTAs), and `ready` (the real charts). This matches the empty-state acceptance criterion in the phase plan.

## Risks / Trade-offs

- **[R1] Estimated values mislead users** → Mitigation: explicit yellow banner on every summary card area when `isEstimated` is true, plus a footer note on the evolution chart.
- **[R2] Distribution percentages drift due to floating point** → Mitigation: residual-rounding strategy (D5) plus a unit test that asserts sums to exactly 100.00 within ±0.01.
- **[R3] `evolution` performance degrades with many trades** → Mitigation: monthly default granularity, plus a `daily` option only when explicitly requested. The loader pulls all active trades for a single portfolio, which is bounded by the user's own data.
- **[R4] API endpoints run four times per page load** → Mitigation: the dashboard client issues the four requests in parallel (`Promise.all` in a single `useEffect`) so the wall-clock cost is one round trip, not four sequential ones.
- **[R5] Recharts adds bundle size** → Mitigation: Recharts is already a declared dependency in `package.json` and is not currently used elsewhere, so this phase converts that already-paid bundle cost into visible features.
- **[R6] No auth means any caller can read any portfolio's data** → Acknowledged. Phase 4 closes this. The service-role client behavior is consistent with existing routes, so we are not making things worse.
