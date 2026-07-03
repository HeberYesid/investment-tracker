# Investment Tracker — Agent Guide

Next.js 15 App Router + React 19 + Supabase. UI en español. Moneda base USD; brokers en USD (eToro, XTB) o COP (Trii, eTrading Bancolombia).
Use pnpm.
Restricción: USD 0/mes
Vercel Hobby + Supabase Free únicamente. Sin servicios pagos.
Antes de commit: Formatear, lint, tipos, pruebas, build.
Usa OpenSpec cli, schema: `spec-driven`.
Fases de desarrollo en docs/phases.

## Convenciones globales

- **i18n**: strings en español en `src/lib/i18n/*.ts`. Sin copy hardcodeado en componentes.
- **Tailwind v4**: config via `@theme` en `src/app/globals.css`. **No existe `tailwind.config.*`**. PostCSS plugin: `@tailwindcss/postcss`.
- **Path alias**: `@/*` → `./src/*` (tsconfig + Vitest).

## Clientes Supabase

Canon en `src/lib/AGENTS.md`. `SUPABASE_SERVICE_ROLE_KEY` nunca en `NEXT_PUBLIC_*`.

### Routing de tareas

- Trivial (typo, 1 línea) o bug aislado → resolver directo o subagente (`code-reviewer`, `tdd-guide`).
- Harness/config change → subagente `harness-optimizer` directo.
- Feature no trivial (>1 sesión) o criterios abiertos → **OpenSpec primero** (skill `openspec-propose`).

## Arquitectura (índice)

| Sección | Responsabilidad | Guía |
|---|---|---|
| `src/app/` | App Router pages, layouts, Route Handlers (`api/v1/`) | `src/app/AGENTS.md` |
| `src/lib/` | Lógica de negocio (api errors, validations, supabase clients, csv, market-data, dashboard, calculations, i18n, reference) | `src/lib/AGENTS.md` |
| `src/components/` | UI primitives (`ui/`), layout, charts | — |
| `src/features/` | Feature-level client/server components (new-trade, edit-trade, import) | — |
| `src/middleware.ts` | Session refresh + auth gate para páginas y API | — |
| `supabase/` | SQL numerado `000N_*.sql`; `0001_foundation.sql` es **inmutable**, Edge Functions Deno (`sync-prices`, `sync-fx-rates`, `_shared`) | `supabase/AGENTS.md` |
| `tests/` | Vitest unit + Playwright e2e + fixtures CSV | `tests/AGENTS.md` |
| `openspec/` | Proposals, tasks, specs (spec-driven) | — |
| `docs/investment-tracker/phases/` | Un doc por fase | — |


## Sync de mercado (Phase 5)

- `pg_cron`: `sync-prices-30m` (cada 30 min), `sync-fx-rates-daily` (06:00 UTC). Pausar con `select cron.unschedule(...)`. Edge Functions siguen deployadas, son inertes sin el cron.
- Botón `Sincronizar ahora` en `BenchmarkChart` es **solo dev** (gate `NODE_ENV !== 'production'`) → `POST /api/v1/admin/sync/run`.
- Providers: Yahoo Finance (precios + S&P 500 benchmark) y open.er-api.com (USD/COP). Sin API keys. CORS-restringidos → viven en Edge Functions, no en el cliente.
- Lectura: dashboard y form de trades leen `market_prices` y `fx_rates` cacheados, **nunca** llaman providers on-read.
