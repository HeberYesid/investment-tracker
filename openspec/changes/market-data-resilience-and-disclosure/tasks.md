## 1. Database migration

- [ ] 1.1 Create `supabase/migrations/0006_market_prices_source.sql` that drops the existing `CHECK` on `market_prices.source` and recreates it to allow `'YAHOO'`, `'STOOQ'`, `'BENCHMARK'`.
- [ ] 1.2 Extend `src/supabase/migrations/schema.test.ts` to assert the new CHECK accepts `'STOOQ'` and that pre-existing rows with `'YAHOO'` and `'BENCHMARK'` are still valid after the migration runs against PGlite.

## 2. Stooq provider

- [ ] 2.1 Create `src/lib/market-data/stooq.ts` exporting `createStooqProvider(opts?: StooqProviderOptions): PriceProvider`.
- [ ] 2.2 Define a Zod schema (`StooqCsvRowSchema`) in `src/lib/market-data/stooq.ts` that validates a single CSV row with columns `Symbol,Date,Time,Open,High,Low,Close,Volume` (all required, `Close` must be a positive number).
- [ ] 2.3 Implement the local symbol mapping table (`{ AAPL: 'aapl.us', '^GSPC': '^spx', 'ECOPETROL.CL': 'ec.cl', ... }`) with at least 10 entries covering the brokers already supported (eToro, XTB, Trii, eTrading Bancolombia). Symbols without a mapping MUST reject with `{ code: 'NOT_FOUND' }` before making any HTTP request.
- [ ] 2.4 Implement `fetchQuotes` to build the URL, call Stooq with a desktop `User-Agent` header (reuse `env.userAgent`), parse the CSV body, and return `FetchedQuote[]` with `symbol` reset to the original requested symbol, `currency: 'USD'`, `delayedUntil: null`. Reject with `INVALID_PAYLOAD` on Zod failure, `RATE_LIMITED` on HTTP 429, `TRANSIENT` on network errors, `PERMANENT` on other non-2xx.
- [ ] 2.5 Add Stooq-specific env vars to `src/lib/market-data/config.ts`: `STOOQ_BASE_URL` (default `https://stooq.com`) and the same `MARKET_DATA_TIMEOUT_MS` and `MARKET_DATA_USER_AGENT` already used by Yahoo.
- [ ] 2.6 Write `tests/unit/market-data/stooq.test.ts` with fixtures: (a) valid CSV for `aapl.us` resolves with the expected quote; (b) malformed CSV rejects with `INVALID_PAYLOAD`; (c) HTTP 429 rejects with `RATE_LIMITED`; (d) unmapped symbol rejects with `NOT_FOUND` without making an HTTP request; (e) network error rejects with `TRANSIENT`.

## 3. Composite provider

- [ ] 3.1 Create `src/lib/market-data/composite.ts` exporting `createCompositeProvider(providers: PriceProvider[]): PriceProvider` that orchestrates providers in the order given.
- [ ] 3.2 Implement `fetchQuotes` to map each symbol to a per-symbol promise that tries providers in order; the first non-erroring result wins and the returned `FetchedQuote` carries the `source` of the provider that produced it.
- [ ] 3.3 Implement per-symbol fallback semantics: if the primary returns `RATE_LIMITED`, `TRANSIENT`, or `PERMANENT`, try the next provider; if all fail, return the primary's error.
- [ ] 3.4 Implement a `fetchQuotesWithBreakdown` helper (or return a tuple) that the Edge Function can use to log `yahoo_ok=N, stooq_fallback=M` into `market_sync_runs.error`.
- [ ] 3.5 Write `tests/unit/market-data/composite.test.ts`: (a) Yahoo 200 ok → Stooq not called; (b) Yahoo 429 + Stooq 200 → composite returns Stooq quote tagged with `source: 'STOOQ'`; (c) Yahoo 404 + Stooq 404 → composite returns the Yahoo error; (d) Yahoo 200 with one symbol, Yahoo 429 with another → composite returns both with appropriate sources.

## 4. Registry update

- [ ] 4.1 Update `src/lib/market-data/registry.ts` so `getPriceProvider()` returns `createCompositeProvider([createYahooProvider(), createStooqProvider()])`. Add a `resetPriceProviderForTests()` helper so unit tests can inject mocks.
- [ ] 4.2 Update `tests/unit/market-data/yahoo-profile.test.ts` (and any other test that imports the registry directly) to call `resetPriceProviderForTests()` in `beforeEach` and to inject mocks via the existing `opts.env` / `opts.fetchImpl` parameters.

## 5. Edge Function

- [ ] 5.1 Update `supabase/functions/sync-prices/index.ts` to import the composite from a shared module (e.g. `supabase/functions/_shared/composite.ts`) constructed once per run, and to call `fetchQuotesWithBreakdown` so the per-provider counts land in `market_sync_runs.error` as `"yahoo_ok=N,stooq_fallback=M"` (only when the run is `SUCCESS`).
- [ ] 5.2 Pass the composite's resolved `source` value (`'YAHOO'`, `'STOOQ'`, `'BENCHMARK'`) to the `market_prices` insert so the row records the effective provider.
- [ ] 5.3 Update `supabase/functions/_shared/yahoo.ts` if needed so the Deno side can import the composite (mirror the Node-side logic without adding new Deno dependencies).
- [ ] 5.4 Smoke test the Edge Function locally with `supabase functions serve sync-prices` against a fixture that includes one Yahoo-failing symbol to confirm the breakdown string and the `source = 'STOOQ'` row.

## 6. Sync status endpoint

- [ ] 6.1 Create `src/lib/dashboard/sync-status.ts` exporting `loadSyncHealth(supabase, now?: Date): Promise<SyncHealth>`. The function MUST use `createServiceSupabaseClient()` to read `market_sync_runs` (kind = `'PRICES'`), MUST compute the most recent `SUCCESS` and `FAILED` rows, MUST derive `lastFailureReason` from a small `categorizeFailureReason(error: string | null, failedAssetCount: number, status: string)` helper, and MUST compute `nextRunEstimate = lastAttemptAt + 30 min` rounded up to the next minute.
- [ ] 6.2 Define `SyncHealthSchema` in `src/lib/validations/dashboard.ts` (z.object) and add it as a new field on `SummaryResponse` and `SnapshotResponse`. Add a new boolean `shouldShowStaleBanner` to `SnapshotResponse`.
- [ ] 6.3 Create `src/app/api/v1/market-data/sync-status/route.ts` (GET, user-scoped via `requireApiUser()`) that calls `loadSyncHealth`, returns the `SyncHealth` JSON, and applies a 60-second `unstable_cache` keyed by user id.
- [ ] 6.4 Hook the existing rate-limit middleware (or add one if missing) to enforce 60 req/min on the new endpoint. Use the same in-memory or KV-based limiter already used elsewhere in the app.
- [ ] 6.5 Write `tests/unit/dashboard/sync-status.test.ts` covering: recent success → `lastFailureReason = 'NONE'`; recent failure → `'TOTAL_FAILURE'`; partial failure with `RATE_LIMITED` in `error` → categorized correctly; no runs in 7 days → nulls. Use PGlite + a stubbed `market_sync_runs` fixture.
- [ ] 6.6 Update `src/lib/dashboard/snapshot.ts` to compute `sync` and `shouldShowStaleBanner` in `loadSnapshot` and pass them to the route. Update `src/app/api/v1/dashboard/summary/route.ts` and `src/app/api/v1/dashboard/snapshot/route.ts` to include the new fields in their responses.
- [ ] 6.7 Update existing tests (`src/__tests__/api/dashboard.test.ts`, `tests/integration/dashboard/summary.test.ts`) to assert the new `sync` and `shouldShowStaleBanner` fields.

## 7. i18n: relative date helper

- [ ] 7.1 Create `src/lib/i18n/dates.ts` with `formatRelativeEs(iso: string, now?: Date): string`. Output examples: `"hace 5 min"`, `"hace 2 h 14 min"`, `"ayer 18:32"`, `"14 jun 18:32"` (for older than 7 days). Use `Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })` and a `Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })` for the fallback.
- [ ] 7.2 Add the seven Spanish reason strings to `src/lib/i18n/dashboard.ts`: `staleReasonMarketClosed`, `staleReasonUpstreamNull`, `staleReasonRateLimited`, `staleReasonNetworkError`, `staleReasonPartialFailure`, `staleReasonTotalFailure`, plus the two banner-with-time variants (`staleBannerWithTime`, `staleBannerWithReason`).
- [ ] 7.3 Write `tests/unit/i18n/dates.test.ts` covering each of the four output shapes and edge cases (same minute, exactly 1 hour, exactly 24 hours, 8 days ago).

## 8. UI: enriched stale banner

- [ ] 8.1 Update `src/components/charts/summary-cards.tsx` to render the new banner structure: title, relative time line, reason line, and (when applicable) "Próximo intento: en ~X min" derived from `sync.nextRunEstimate` and `formatRelativeEs`.
- [ ] 8.2 Pass `sync: SyncHealth` from the dashboard page server loader into `SummaryCards` (extend the prop type, keep backward-compat by treating undefined as "no sync info").
- [ ] 8.3 Update `src/components/charts/distribution-chart.tsx` to expand the clock-icon tooltip with the source of the price (read from `slice.source` added to `DistributionSlice` schema). Use the format `"Cotización del <fecha> · Fuente: <Yahoo|Stooq|Benchmark>"`.
- [ ] 8.4 Extend `DistributionSlice` and `DistributionResponse` in `src/lib/validations/dashboard.ts` to include the per-slice `source` (and `observedAt` if not already there). Update the `dashboard/distribution/route.ts` loader to compute and return it.
- [ ] 8.5 Write `tests/component/summary-cards.test.tsx` (or extend the existing one) to assert the banner renders the relative time and the reason when `sync` is provided, and that it falls back to the old "Precio desactualizado" message when `sync` is undefined.
- [ ] 8.6 Write `tests/component/distribution-chart.test.tsx` (or extend) to assert the clock-icon tooltip includes the source.

## 9. Tests, lint, build

- [ ] 9.1 Run `pnpm lint` and fix any new lint errors.
- [ ] 9.2 Run `pnpm test:run` and confirm all new and existing tests pass.
- [ ] 9.3 Run `pnpm build` and confirm the production build succeeds (this is the de-facto typecheck per AGENTS.md).
- [ ] 9.4 Run `pnpm test:e2e` against a dev server and confirm the new banner copy and tooltip are visible in the dashboard.

## 10. Documentation

- [ ] 10.1 Update `README.md` (or the relevant `docs/investment-tracker/phases/*.md`) to mention: Stooq as fallback provider, the new `/api/v1/market-data/sync-status` endpoint, the enriched banner copy, and the migration `0006_market_prices_source.sql`.
- [ ] 10.2 Update `src/lib/market-data/README.md` (if it exists) or add inline JSDoc to `src/lib/market-data/composite.ts` explaining the order of providers and how to add a new one.
