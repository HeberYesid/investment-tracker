# src/app

App Router. Prefijo `api/v1/` intencional.

## Estructura

- `trades/` — list, /new, /[id]/edit
- `import/` — CSV upload
- `settings/` — Ajustes de portafolio (OWNER-only: `/settings/members` para invitar/cambiar rol/eliminar miembros)
- `api/v1/` — Route Handlers (trades CRUD, imports csv/preview|commit|history|[id], portfolio members)

## Reglas

- **Mutaciones Supabase** desde Server Components → Route Handlers aquí. No llamar `.insert`/`.update`/`.delete` directamente desde RSC.
- **Errores** en Route Handlers → helpers de `src/lib/api/errors.ts` (`badRequest`, `validationError`, `serverError`, `unauthorized`, `forbidden`, `notFound`).
- Pages y layouts son Server Components por default; marca con `"use client"` solo si necesitas estado/efectos.
- **Role gating** en pages: si la página exige OWNER (e.g. `/settings/members`), redirige a `/` en el RSC antes de fetchear; si exige escritura (EDITOR/OWNER), consulta el rol vía `getCurrentPortfolio()` y pasa `canWrite` al cliente.
