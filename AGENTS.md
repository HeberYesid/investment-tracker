# Investment Tracker — Agent Guide

Next.js 15 App Router + React 19 + Supabase. UI en español (`lang="es"`). Moneda base USD; brokers en USD (eToro, XTB) o COP (Trii, eTrading Bancolombia).
Use pnpm.

## Restricción absoluta: USD 0/mes

Vercel Hobby + Supabase Free únicamente. Sin servicios pagos. Detalles en `README.md` "Cost Guardrails".
Orden recomendado antes de commit: `pnpm lint && pnpm exec tsc --noEmit && pnpm test:run && pnpm build`.

## Convenciones globales

- **i18n**: strings en español en `src/lib/i18n/*.ts` (dictionary, auth, dashboard, trades, imports, errors, members, asset-metadata). Sin copy hardcodeado en componentes.
- **Role gating**: helper único `getCurrentPortfolio()` en `src/lib/supabase/auth.ts`. Páginas sensibles (e.g. `/settings/members`) leen `portfolio.role` y redirigen en el RSC. Mutaciones en Route Handlers pasan `{ writeAccess: true }` a `requireApiUserWithPortfolio` para que VIEWERs reciban `403 FORBIDDEN` con `errors.writeAccessDenied`. Cliente: `canWrite = role !== "VIEWER"` se pasa explícitamente a los componentes cliente.
- **Errores** en Route Handlers → `badRequest` / `validationError` / `serverError` / `unauthorized` / `forbidden` / `notFound` desde `src/lib/api/errors.ts`. Formato: `{ error: { code, message, details? } }`. No devolver `Response` con status crudo.
- **Dinero** (objetivo de wire): decimales como string. Contrato Zod actual: `src/lib/validations/trades.ts`. `normalizeTradeUsdValues` calcula `total_invested_usd`, `fx_rate_to_usd`, etc. antes de persistir.
- **Tailwind v4**: config via `@theme` en `src/app/globals.css`. **No existe `tailwind.config.*`**. PostCSS plugin: `@tailwindcss/postcss`.
- **Mutaciones Supabase** desde Server Components → Route Handlers en `src/app/api/v1/...`. No llamar `.insert`/`.update`/`.delete` desde RSC.
- **Path alias**: `@/*` → `./src/*` (tsconfig + Vitest).
- **Tests unit**: `src/**/*.test.{ts,tsx}` y `tests/**/*.test.{ts,tsx}`. Excluye `tests/e2e/**`. **No habilitar `oxc: true` en vitest.config.ts** — rompe el transform actual (usar `esbuild`).
- **Tests e2e**: `tests/e2e/`, un solo project `mobile-chromium` (Pixel 5). Web server arranca solo; `reuseExistingServer: !isCI`.

## Clientes Supabase (3 sabores)

| Cliente | Dónde usar |
|---|---|
| `createBrowserSupabaseClient()` | Client components |
| `createUserSupabaseClient()` | **Default**: Route Handlers, RSC, Server Actions. Lee cookies, respeta RLS. |
| `createServiceSupabaseClient()` | Bypassa RLS. Solo tareas internas confiables. **Nunca en `src/app/`**. |

`SUPABASE_SERVICE_ROLE_KEY` → nunca como `NEXT_PUBLIC_*`, nunca importar en client components.

## OpenSpec (proposal-driven changes)

CLI `openspec` es prerrequisito. Config: `openspec/config.yaml` (schema: `spec-driven`). Skills (vía tool `skill`): `openspec-propose|apply|archive|sync|explore`.

- **Phase docs** (`docs/investment-tracker/phases/00..07-*.md`) = fuente humana del "qué".
- **`openspec/changes/<id>/proposal.md`** = contrato de trabajo para features no triviales.
- **`openspec/changes/<id>/tasks.md`** = checklist ejecutable.
- **`openspec/specs/`** = specs canónicas por dominio (market-data-*).

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
| `supabase/migrations/` | SQL numerado `000N_*.sql`; `0001_foundation.sql` es **inmutable** | `supabase/AGENTS.md` |
| `supabase/functions/` | Edge Functions Deno (`sync-prices`, `sync-fx-rates`, `_shared`) | `supabase/AGENTS.md` |
| `tests/` | Vitest unit + Playwright e2e + fixtures CSV | `tests/AGENTS.md` |
| `openspec/` | Proposals, tasks, specs (spec-driven) | — |
| `docs/investment-tracker/phases/` | Un doc por fase — **verificar estado antes de scopear** | — |
| `.opencode/skills/` | OpenSpec skills (cargar con tool `skill`) | — |

## Setup y entorno

- Copiar `.env.example` a `.env.local`. Variables requeridas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (en dev `http://127.0.0.1:3000`).
- `NEXT_PUBLIC_SITE_URL` se usa en el magic link de Supabase Auth (`${SITE_URL}/auth/callback?next=...`).
- `ADMIN_CACHE_TOKEN` (server-only) autoriza a las Edge Functions a invalidar tags de Next cache vía `POST /api/v1/admin/cache/invalidate`. Generar con `openssl rand -hex 32`.
- Auth setup manual por proyecto (ver `.env.example` final): URL Configuration → Site URL = `NEXT_PUBLIC_SITE_URL`, Additional Redirect URLs = `${NEXT_PUBLIC_SITE_URL}/auth/callback`.
- Por cada DB, insertar en `public.sync_settings` (`EDGE_FUNCTION_BASE`, `SUPABASE_ANON_KEY`) — **no commitear valores reales**.

## Sync de mercado (Phase 5)

- `pg_cron`: `sync-prices-30m` (cada 30 min), `sync-fx-rates-daily` (06:00 UTC). Pausar con `select cron.unschedule(...)`. Edge Functions siguen deployadas, son inertes sin el cron.
- Botón `Sincronizar ahora` en `BenchmarkChart` es **solo dev** (gate `NODE_ENV !== 'production'`) → `POST /api/v1/admin/sync/run`.
- Providers: Yahoo Finance (precios + S&P 500 benchmark) y open.er-api.com (USD/COP). Sin API keys. CORS-restringidos → viven en Edge Functions, no en el cliente.
- Lectura: dashboard y form de trades leen `market_prices` y `fx_rates` cacheados, **nunca** llaman providers on-read.

## Watch out

- **`check-db.mts` (raíz) contiene un service-role key hardcodeado de un proyecto Supabase real** y está trackeado en git. **No ejecutar ni commitear más cambios sin antes** (1) rotar la key en el dashboard de Supabase, (2) borrar el archivo, (3) purgarlo del historial. Cualquier key en código committed = comprometida.
- `supabase/functions/**` está excluido del tsconfig y del build de Next — no importar desde `src/`.
- `tests/e2e/**` está excluido de Vitest — los tests de Playwright no corren con `pnpm test:run`.
- ESLint requiere `@eslint/eslintrc` resuelto por pnpm store; si rompe tras cambios de deps, correr `pnpm install` antes de `pnpm lint`.
- `pnpm-workspace.yaml` solo bloquea `sharp` y `unrs-resolver`; no es un monorepo, es un single-package workspace.
- No hay CI (`.github/workflows/` no existe) — el agente no debe asumir que un pipeline valida sus cambios.
