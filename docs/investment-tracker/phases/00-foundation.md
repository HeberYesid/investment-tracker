# Phase 0: Foundation Plan

## Goal

Create the application shell, database foundation, local development workflow, and free-tier-safe infrastructure decisions.

## Scope

- Initialize Next.js with TypeScript.
- Configure Tailwind CSS and shadcn/ui.
- Configure Supabase client and local environment variables.
- Create initial Supabase migrations.
- Seed broker reference data.
- Add Spanish i18n foundation.
- Add test tooling.
- Add cost guardrails.

## Files And Areas

```txt
package.json
next.config.ts
tailwind.config.ts
app/layout.tsx
app/page.tsx
components/ui/
features/dashboard/
lib/supabase/
lib/i18n/
supabase/migrations/
tests/
.env.example
README.md
```

## Tasks

- [x] Create Next.js App Router project with TypeScript.
- [x] Install Tailwind CSS, shadcn/ui, Zod, TanStack Query, React Hook Form, Recharts, Vitest, Testing Library, and Playwright. (PapaParse not installed — CSV parsing is hand-rolled in `src/lib/csv/parsers/`; `xlsx` is used for the broker-provided Excel files in `tests/fixtures/files/`.)
- [x] Add `.env.example` with public Supabase URL/key and private service role placeholder.
- [x] Create Supabase migration for `brokers`, `assets`, `portfolios`, `portfolio_members`, `trades`, `csv_imports`, `csv_import_rows`, `market_prices`, `fx_rates`, `portfolio_snapshots`, `alerts`, `alert_events`, and `audit_events`. (`supabase/migrations/0001_foundation.sql`; `portfolio_snapshots`/`alerts`/`alert_events` tables exist but their UI/CRUD ships in later phases.)
- [x] Enable RLS on all public tables.
- [x] Add RLS policies that require authenticated ownership via `portfolio_members` (Supabase Auth is enabled; the original "anonymous local MVP" fallback is no longer needed because the auth flow is wired in Phase 4).
- [x] Seed brokers: `ETORO`, `XTB`, `TRII`, `ETRADING_BANCOLOMBIA`. (`src/lib/reference/brokers.ts` is the runtime seed; see `supabase/migrations/0001_foundation.sql` for the SQL seed.)
- [x] Create shared layout with mobile-first navigation. (`src/app/layout.tsx`, `src/components/layout/main-navigation.tsx`, `src/components/ui/button.tsx`.)
- [x] Create Spanish i18n dictionary with initial route labels. (`src/lib/i18n/dictionary.ts` + `auth.ts`, `dashboard.ts`, `trades.ts`, `imports.ts`, `errors.ts`, `asset-metadata.ts`.)
- [x] Add `Cost Guardrails` section to `README.md`. (`README.md:122`.)

## Technical Decisions

- Use UUID primary keys.
- Use `numeric(20, 8)` for money and quantities.
- Store original trade currency and USD-normalized values.
- Use soft delete for trades.
- Keep provider credentials server-side only.
- Do not store original CSV files by default.

## Tests

- Migration smoke test: database starts and migrations apply.
- Unit test: broker seed values exist.
- Unit test: i18n dictionary returns Spanish labels.
- E2E smoke test: home page renders on mobile viewport.

## Acceptance Criteria

- App runs locally.
- Database schema applies from a clean Supabase instance.
- RLS is enabled on every public table.
- Navigation renders in Spanish.
- No paid service is required to boot the app.

## Cost Controls

- Vercel Hobby only.
- Supabase Free only.
- No paid cron, queue, storage, analytics, or email dependency.
- Disable any package or integration that requires billing to function.

