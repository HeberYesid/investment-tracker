# src/app

App Router. Prefijo `api/v1/` intencional.

## Estructura

- `trades/` — list, /new, /[id]/edit
- `import/` — CSV upload
- `api/v1/` — Route Handlers (trades CRUD, imports csv/preview|commit|history|[id])

## Reglas

- **Mutaciones Supabase** desde Server Components → Route Handlers aquí. No llamar `.insert`/`.update`/`.delete` directamente desde RSC.
- **Errores** en Route Handlers → helpers de `src/lib/api/errors.ts` (`badRequest`, `validationError`, `serverError`).
- Pages y layouts son Server Components por default; marca con `"use client"` solo si necesitas estado/efectos.
