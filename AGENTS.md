# Investment Tracker — Agent Guide

Next.js 15 App Router + React 19 + Supabase. UI en español (`lang="es"`). Moneda base USD; brokers en USD (eToro, XTB) o COP (Trii, eTrading Bancolombia). Usar **pnpm**.

## Restricción absoluta: USD 0/mes

Vercel Hobby + Supabase Free únicamente.

## Convenciones globales

- **i18n**: strings en español en `src/lib/i18n/*.ts`. Sin copy hardcodeado en componentes.
- **Errores** en Route Handlers → `badRequest` / `validationError` / `serverError` desde `src/lib/api/errors.ts`.
- **Dinero**: decimales como string en el wire; el contrato es el schema Zod en `src/lib/validations/trades.ts`.
- **Tailwind v4**: config via `@theme` en `globals.css`. **No existe `tailwind.config.*`**.
- **Mutaciones Supabase** desde Server Components → Route Handlers en `src/app/api/v1/...`.

## OpenSpec (proposal-driven changes)

Config: `openspec/config.yaml` (schema: `spec-driven`). Skills: `openspec-propose|apply|archive|sync|explore`. CLI `openspec` es prerrequisito. Para trabajo no trivial, carga la skill con la tool `skill`.

## Arquitectura (índice)

| Sección | Responsabilidad | Guía |
|---|---|---|
| `src/app/` | App Router, Route Handlers | `src/app/AGENTS.md` |
| `src/lib/` | Lógica de negocio (api, csv, validations, etc.) | `src/lib/AGENTS.md` |
| `supabase/` | Migraciones SQL + Edge Functions Deno | `supabase/AGENTS.md` |
| `tests/` | Vitest (unit) + Playwright (e2e) | `tests/AGENTS.md` |
| `docs/investment-tracker/phases/` | Un doc por fase — verificar estado antes de scopear | — |
