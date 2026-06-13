<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Investment Tracker — Agent Guide

Mobile-first investment tracker. Next.js 15 App Router + React 19 + Supabase Postgres. Single package, not a monorepo. Base currency is USD; broker currencies are USD (eToro, XTB) or COP (Trii, eTrading Bancolombia). All UI copy is Spanish (`lang="es"` in `src/app/layout.tsx`).

## Non-negotiable constraint: USD 0/month operating cost

The project must stay on free tiers — Vercel Hobby + Supabase Free. Do not add paid services, paid cron, paid queues, paid analytics, paid email, or paid notification providers. External providers (market data, FX, etc.) must sit behind an internal adapter interface so they can be swapped. Client-side PDF/Excel export only. No paid market data before V2.

## Package manager and runtime

- `pnpm@11.5.2` is pinned via `packageManager` in `package.json`. Use `pnpm`, not `npm`/`yarn`.
- Node: `@types/node@^20` is the target. Do not assume Node 22+ APIs.
- `pnpm-workspace.yaml` exists but the workspace is not used for app code — it only sets `allowBuilds` for `sharp` and `unrs-resolver` (false) and `minimumReleaseAgeExclude` for Next 16 previews. Leave it alone unless you change the install-time build allowlist.

## Commands

| Goal | Command | Notes |
| --- | --- | --- |
| Dev server | `pnpm dev` | Listens on `:3000`. Hot reload. |
| Production build | `pnpm build` | Run before merging schema-touching changes. |
| Lint | `pnpm lint` | Flat config — see `eslint.config.mjs`. |
| Unit + component + schema tests (one-shot) | `pnpm test:run` | Vitest with jsdom. Excludes `tests/e2e/**`. |
| Vitest watch | `pnpm test` | |
| E2E | `pnpm test:e2e` | Playwright. Auto-starts `next dev` on `127.0.0.1:3100`. See "E2E gotchas". |

Run `pnpm lint && pnpm test:run` before considering a change done. There is no separate typecheck script — `next build` is the de-facto typecheck; ESLint is the day-to-day check.

## Environment

Copy `.env.example` to `.env.local` and fill in three Supabase values:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — safe in browser.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, full DB access. **Never** expose to a `NEXT_PUBLIC_*` variable or import it in client components.

Two Supabase clients exist in `src/lib/supabase/`, pick the right one:
- `createBrowserSupabaseClient()` uses the publishable key; for client components.
- `createUserSupabaseClient()` reads the request cookies and returns a user-scoped client. **This is the default for Route Handlers, Server Components, and Server Actions.** It is subject to RLS.
- `createServiceSupabaseClient()` uses the service role key and bypasses RLS. Reserved for trusted internal tasks (background jobs, admin scripts). Do not use it in `src/app/` — every request handled here will be tied to a user.

## Architecture (where to put new code)

```
src/app/                Next.js App Router
  layout.tsx            Root layout, sets <html lang="es"> and Geist fonts
  page.tsx              Spanish home/dashboard entry
  trades/               /trades list, /trades/new, /trades/[id]/edit
  import/               /import CSV upload page
  api/v1/               Route Handlers (note: v1 prefix is intentional)
    trades/             CRUD for trades
    imports/csv/preview Multipart preview — returns parsed rows + validation
    imports/csv/commit  Persists a previously previewed import
    imports/history     List past imports
    imports/[id]        Single import detail
src/components/         Cross-feature UI primitives and layout
  layout/               MainNavigation, etc.
  ui/                   shadcn-style primitives (Button uses CVA)
src/features/           Feature-scoped client components
  trades/               TradesPageClient, TradeForm, TradeList, TradeFilters, edit/new clients
  imports/              ImportPageClient, ImportHistory
src/lib/                Shared logic (no React)
  api/errors.ts         badRequest / validationError / serverError helpers — use these, don't roll your own
  calculations/positions.ts   Position aggregation logic
  csv/                  CSV import pipeline
    parsers/            One file per broker (etoro, xtb, trii, etrading-bancolombia)
    registry.ts         getCsvParser(brokerCode) — **register new parsers here**
    validation.ts       validateParsedRows
    date-parsers.ts     Broker-specific date parsing
    xtb-comment-parser.ts  Extracts metadata from XTB comment fields
    file-reader.ts      File → raw text
  i18n/                 Spanish label dictionaries (dictionary.ts, trades.ts, imports.ts)
  reference/brokers.ts  BrokerCode union and BROKER_SEEDS — single source of truth
  supabase/             See "Environment" above
  validations/          Zod schemas (TradeFormInput, TradeListQuery, normalizeTradeUsdValues)
src/test/setup.ts       Vitest setup (loads @testing-library/jest-dom/vitest)
supabase/migrations/    Numbered SQL migrations; see "Database"
tests/
  unit/                 Vitest unit tests (tests/unit/csv/*)
  e2e/                  Playwright tests (tests/e2e/home.spec.ts) — **excluded from vitest**
  fixtures/             Sample broker CSV/XLSX files
docs/investment-tracker/
  technical-plan.md     Authoritative product + tech-stack spec
  phases/00..07*.md     One doc per phase; check phase status before scoping work
```

### Adding a new broker
1. Add a `BrokerSeed` to `src/lib/reference/brokers.ts` and `BrokerCode` union.
2. Create `src/lib/csv/parsers/<broker>.ts` implementing `CsvBrokerParser` (see `src/lib/csv/types.ts`).
3. Register the parser in `src/lib/csv/registry.ts`.
4. Add the broker code to the `validBrokers` allowlist in `src/app/api/v1/imports/csv/preview/route.ts` and any other validation lists.
5. Add a fixture under `tests/fixtures/csv/` and a parser test under `tests/unit/csv/parsers-real.test.ts` (or a new file).
6. Add a seed row to `supabase/migrations/0001_foundation.sql` only via a new numbered migration — never edit `0001` once applied.

## Database

- Foundation schema: `supabase/migrations/0001_foundation.sql`. **It is immutable**; changes go in a new `000N_*.sql` file.
- Every `public` table has RLS enabled. New tables must follow the same pattern; the schema test in `src/supabase/migrations/schema.test.ts` will fail otherwise.
- All trades carry USD-normalized fields (`total_invested_usd`, `fx_rate_to_usd`, etc.) computed by `normalizeTradeUsdValues` in `src/lib/validations/trades.ts`. Store the original-currency values too.
- The migration smoke test applies the DDL to a PGlite in-memory database — it must run with no Supabase connection.
- `auth.uid()` and the `auth`/`extensions` schemas are stubbed in the smoke test; do not add features that depend on real Supabase Auth objects without stubbing them too.

## Testing gotchas

- Vitest includes `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}` but **excludes `tests/e2e/**`**. E2E is Playwright only.
- Vitest sets `oxc: false` and uses esbuild for JSX (`esbuild: { jsx: "automatic" }`) — do not enable oxc; it breaks the current transform setup.
- The vitest config sets `environment: "jsdom"` and `globals: true`. `@testing-library/jest-dom` matchers are auto-loaded via `src/test/setup.ts`.
- The schema test relies on PGlite (`@electric-sql/pglite`). It strips the `pgcrypto` extension line before applying the migration because PGlite does not implement it — keep the strip step in sync if you add extensions.
- E2E (Playwright) starts its own dev server on `127.0.0.1:3100` (`reuseExistingServer: !process.env.CI`). If port 3100 is busy locally, kill the stale `next dev` or set `CI=1` to force a fresh one.

## Phase status (from README)

Phases 0–2 are done (foundation, trades MVP, CSV import MVP). Phases 3–7 (dashboard, auth, market data + FX, alerts, PWA/exports/crypto/bilingual) are pending. **Always check `docs/investment-tracker/phases/` for the current scope** before designing a change — the docs are the source of truth, not the code.

## OpenSpec workflow (proposal-driven changes)

This repo uses OpenSpec for spec-driven changes. The config lives in `openspec/config.yaml` (schema: `spec-driven`). The agent skills to load are in `.opencode/skills/openspec-*` (also mirrored under `.claude/`, `.codex/`, `.agent/`, `.github/`):
- `openspec-propose` — generate a full change (proposal + design + tasks).
- `openspec-apply` — implement an approved change.
- `openspec-archive` — close out a completed change.
- `openspec-sync` — sync delta specs into main specs without archiving.
- `openspec-explore` — think through a problem before proposing.

For non-trivial work, load the relevant skill via the `skill` tool instead of improvising. The OpenSpec CLI (`openspec`) is a prerequisite.

## Style and conventions

- Spanish UI strings live in `src/lib/i18n/*.ts`. Add new strings to the relevant dictionary, do not inline hardcoded copy in components.
- Server-side work that touches Supabase goes in `src/app/api/v1/...` Route Handlers using `createServerSupabaseClient()`. Do not call Supabase from Server Components for mutation.
- Errors from API routes should use `badRequest` / `validationError` / `serverError` from `src/lib/api/errors.ts` — they standardize the response shape.
- All money fields use string-safe decimals in the wire format; the Zod schema in `src/lib/validations/trades.ts` is the contract.
- Tailwind v4 with `@tailwindcss/postcss` (see `postcss.config.mjs`). No `tailwind.config.*` — config is in CSS via `@theme` in `globals.css`.
- No comments in code unless the user asks (matches repo house style).
- Do not add `*.tsbuildinfo` or `next-env.d.ts` to git — they are ignored.
