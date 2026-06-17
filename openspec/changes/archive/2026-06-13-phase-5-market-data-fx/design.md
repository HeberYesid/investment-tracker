## Context

The dashboard (Phase 3) already renders with the assumption that `market_prices` will eventually be populated, and `resolveAssetPrice()` in `src/lib/calculations/pricing.ts` already understands `delayed_until` and falls back to `TRADE_FALLBACK`. Auth (Phase 4) is in place: every request goes through a user-scoped Supabase client subject to RLS, and `createServiceSupabaseClient()` is reserved for trusted internal work (background jobs, admin scripts). The only thing missing is someone to actually populate `market_prices` and `fx_rates`, plus a UI to expose the data and to flag when data is missing or stale.

Two external providers are in scope:
- **Yahoo Finance** via `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}` (unofficial but pragmatic; no API key; CORS-restricted so the call must come from the server).
- **open.er-api.com** via `https://open.er-api.com/v6/latest/{base}` (no API key, supports COP).

Both sit behind adapter interfaces. The dashboard and the trade form consume the cached rows in `market_prices` / `fx_rates`; they do NOT call the provider on the read path.

## Goals / Non-Goals

**Goals:**
- Populate `market_prices` for every asset with an open position, on a 30-minute cadence.
- Populate `fx_rates` for `('USD','COP')` on a daily cadence.
- Replace the dashboard benchmark placeholder with a real S&P 500 overlay.
- Surface staleness honestly in the UI (badges in `SummaryCards`, icons in `DistributionChart`).
- Pre-fill the COP trade form with the latest FX rate, never blocking submission.
- Stay at USD 0/month operating cost: ~43K Edge Function invocations / month, well under the 500K Supabase Free limit.
- Keep provider implementations swappable via the registry.

**Non-Goals (this phase):**
- Backfill historical COP trades with the rate that was in effect on their `trade_date`.
- Admin UI for editing `assets.yahoo_symbol` (deferred to 5.1).
- COLCAP benchmark (deferred to 5.1 once we confirm Yahoo's coverage and granularity).
- Price alerts (Phase 6).
- Server-side caching of provider responses beyond the `market_prices` table.
- Multi-retry / exponential backoff inside the Edge Functions (one retry, then log to `market_sync_runs`).

## Decisions

### D1. Providers are server-only; the read path never calls them

- **Choice**: `getQuote()` and `getBenchmarkSeries()` are called only from the Supabase Edge Functions. The dashboard and the trade form read from `market_prices` / `fx_rates` only.
- **Rationale**: Yahoo Finance blocks browser CORS. Centralizing the network call in the Edge Function keeps the read path fast and lets us drop in a paid provider later without touching UI code.
- **Alternatives**: (a) call Yahoo from the browser via a CORS proxy — fragile, may break any day. (b) call from Vercel Route Handlers — would work, but every dashboard load would hit a third party; bad for free-tier limits and latency.

### D2. Active-holdings set is computed in SQL inside the Edge Function

- **Choice**: The "active assets" query is a `group by asset_id having sum(quantity_sign) > 0` SQL statement, executed via the service-role client at the top of `sync-prices`. No special table is introduced.
- **Rationale**: The semantics of "active" already exist in `aggregateHoldings()` (TS), but reproducing that in Deno adds drift risk. SQL is authoritative.
- **Alternatives**: (a) create a materialized view `active_holdings` refreshed on trade writes — premature optimization, the 30-min cadence already absorbs any lag.

### D3. Benchmark is treated like any other asset in the batch

- **Choice**: `^GSPC` is included in the same batch as holdings; its `market_prices` row is inserted with `source = 'BENCHMARK'`. A synthetic asset row is created in the migration (sector `'BENCHMARK'`, `ticker = '^GSPC'`, `yahoo_symbol = '^GSPC'`, `country = 'US'`).
- **Rationale**: Avoids a parallel code path and lets the snapshot endpoint read the series from the same table.
- **Alternatives**: (a) store the series in a separate `benchmarks` table — adds a second source of truth for time-series data, not worth it.

### D4. S&P 500 series is normalized to 100 at the first visible point

- **Choice**: `BenchmarkChart` divides every series point by the first non-null value and multiplies by 100, mirroring how the existing `EvolutionChart` normalizes the portfolio series.
- **Rationale**: The two series have different units (USD vs index points); normalization gives them a shared visual scale.
- **Alternatives**: (a) show absolute portfolio USD vs absolute S&P 500 USD — the S&P 500 is an index, not a price, so the visual is meaningless without normalization.

### D5. Stale thresholds are centralized

- **Choice**: `PRICE_STALE_MS = 2 h` and `FX_STALE_MS = 24 h` in `src/lib/market-data/staleness.ts` and `src/lib/fx/staleness.ts`. Both the snapshot endpoint and the UI hooks read from these constants.
- **Rationale**: A single source of truth lets us tune the thresholds without a code review on every consumer.
- **Alternatives**: per-call thresholds — premature flexibility, just adds inconsistency.

### D6. `pg_cron` is the scheduler; `pg_net` is the bridge to Edge Functions

- **Choice**: Migration `0004` enables `pg_cron` and `pg_net` and schedules two jobs that call `enqueue_sync_run('PRICES' | 'FX')`. The function uses `net.http_post(...)` to invoke the Edge Function URL with the service-role bearer.
- **Rationale**: pg_cron + pg_net is the canonical Supabase pattern for "run an Edge Function on a schedule" without external dependencies. Both extensions are available on Supabase Free.
- **Alternatives**: (a) GitHub Actions — adds a provider and a public endpoint with a long-lived secret. (b) Vercel Cron — Hobby tier is 2 jobs/day, insufficient for 30-min cadence. (c) Supabase's built-in "Scheduled Functions" UI — does the same as pg_cron+pg_net, but managing it via SQL keeps the schedule in version control.

### D7. `market_sync_runs` is service-role-only

- **Choice**: RLS is enabled and NO policy grants access to `anon` or `authenticated`. Only the service role can read or write.
- **Rationale**: Sync metadata is internal. Exposing it would create a side channel for inference ("user X has a holding in AAPL because a sync run listed it").
- **Alternatives**: (a) grant read to authenticated — minor observability benefit, not worth the privacy cost.

### D8. The dev-only "Sincronizar ahora" button is gated by `NODE_ENV`

- **Choice**: The button in `BenchmarkChart` is rendered only when `process.env.NODE_ENV !== 'production'`. The endpoint itself stays in the codebase (still useful for one-off triggers).
- **Rationale**: Keeps the production surface small while preserving the developer experience.

### D9. Deno appears only inside `supabase/functions/`

- **Choice**: The Next.js / Vitest / ESLint side of the repo continues to use Node 20 + pnpm. Only the Edge Functions are Deno. Tests for the providers run under Vitest by importing a thin Node-compatible shim that wraps the provider's HTTP calls.
- **Rationale**: Two runtimes in one repo is a maintenance tax; the functions are small enough that keeping them isolated is the right trade.

## Risks / Trade-offs

- **[Risk] Yahoo Finance changes its endpoint shape** → Mitigation: Zod schemas in `src/lib/market-data/yahoo-finance.schema.ts` are the only place that depends on the wire format. A breaking change is a one-file fix; if the schema rejects everything, the snapshot silently falls back to `TRADE_FALLBACK` and the dashboard stays correct.
- **[Risk] `pg_cron` or `pg_net` is not enabled on a project** → Mitigation: `create extension if not exists` is a no-op. The Edge Functions still deploy. The README documents the GitHub Actions fallback. Schema test stubs the `net` schema so it runs in PGlite.
- **[Risk] S&P 500 series missing on day one** → Mitigation: `BenchmarkChart` shows the "no sincronizado" state with a dev-only trigger. The first cron tick after deployment populates the series.
- **[Risk] Yahoo blocks our User-Agent** → Mitigation: we set a realistic desktop UA (`Mozilla/5.0 ...`). If it ever blocks, swapping to FMP or Twelve Data is a registry change.
- **[Risk] Stale prices shown as fresh because `delayed_until` is in the future** → Mitigation: `resolveAssetPrice()` already checks `delayed_until > now` and falls back. The snapshot endpoint adds an additional age check (`observed_at < now - 2h`). Two layers.
- **[Risk] Colombian tickers pollute the batch with permanent 404s** → Mitigation: 404s are normalized to `NOT_FOUND` and the symbol is dropped from the batch on subsequent runs by checking the `assets.yahoo_symbol` column — a `null` symbol short-circuits before HTTP. The migration adds a "no symbol" check.
- **[Trade-off] 30-min cadence means at most 30 min of price drift** → Acceptable for a free tracker and for the kind of decisions the app supports. Tighter would burn the free tier.

## Migration Plan

1. Land the migration `0004_market_data_sync.sql` against the target Supabase project.
2. Verify the cron jobs landed: `select * from cron.job;` should show `sync-prices-30m` and `sync-fx-rates-daily`.
3. Deploy the Edge Functions: `supabase functions deploy sync-prices` and `... sync-fx-rates`.
4. Configure the two Postgres settings referenced by `enqueue_sync_run`:
   - `alter database postgres set app.edge_function_base = 'https://<project-ref>.functions.supabase.co';`
   - `alter database postgres set app.service_role_key = '<service-role key>';` (this key already exists in the project's `SUPABASE_SERVICE_ROLE_KEY`).
5. Hit `POST /api/v1/admin/sync/run` once with `{ kind: 'PRICES' }` as an OWNER; confirm a `market_sync_runs` row appears with `status = 'SUCCESS'` and a few `market_prices` rows.
6. Wait one 30-min tick and verify the S&P 500 benchmark chart now renders.
7. Rollback: `select cron.unschedule('sync-prices-30m'); select cron.unschedule('sync-fx-rates-daily');`. The functions and tables can stay in place — they are inert without the crons.

## Open Questions

- **Q1**: Should the synthetic benchmark asset be a real row in `public.assets` (visible in `assets` lookups) or stored as a code constant? **Current direction**: real row, with a comment in the migration explaining why.
- **Q2**: If the S&P 500 series comes back with a different currency (`USD` only — no real alternative, but worth noting), the normalization still works because the unit is "index value" not "USD". No action needed.
- **Q3**: What happens to the "Sync now" button in production builds if `NODE_ENV` is mis-set? **Defense**: the endpoint also requires OWNER, so a misconfigured button is at most a convenience, not a security hole.
