# Arquitectura — Qué significa "hacer un buen trabajo"

> Este documento define el estándar de calidad para el proyecto.
> Los agentes revisores evalúan código contra este archivo.
> Si no está aquí, no es un requisito.

## Principios

1. **Capas claras.** El proyecto tiene cuatro capas y solo cuatro:
   - `src/app/` — App Router (pages, layouts, Route Handlers `api/v1/`).
   - `src/lib/` — Lógica de negocio (validaciones, clientes, cálculos, i18n, CSV, market-data).
   - `src/components/` — UI primitives (`ui/`) y layout/charts.
   - `src/features/` — Feature-level components (new-trade, edit-trade, import, etc.).
   No introducir capas adicionales sin una razón concreta documentada en `feature_list.json`.

2. **Mutaciones desde Route Handlers.** Las operaciones `.insert`/`.update`/`.delete` de Supabase
   solo se ejecutan desde Route Handlers en `src/app/api/v1/`. Server Components y RSC hacen
   solo lecturas. Esto garantiza que el service role nunca se filtre al cliente.

3. **Errores explícitos.** Los Route Handlers usan los helpers de `src/lib/api/errors.ts`
   (`badRequest`, `validationError`, `serverError`, `unauthorized`, `forbidden`, `notFound`).
   No devolver `Response` con status crudo.

4. **Dinero como string en el wire.** Los decimales viajan como `"123.45"` en el contrato Zod
   (`src/lib/validations/trades.ts`). El server hace `parse`/`Decimal` solo en el límite.
   Nunca usar `number` para valores monetarios en el wire.

5. **Separación de responsabilidades.** `src/lib/calculations/` contiene funciones puras.
   `src/lib/dashboard/loader.ts` coordina lecturas. `src/lib/dashboard/snapshot.ts` compone
   cálculos. No mezclar IO con lógica de dominio.

6. **Cliente Supabase correcto para cada contexto.**
   | Cliente | Cuándo |
   |---|---|
   | `createBrowserSupabaseClient()` | Client components |
   | `createUserSupabaseClient()` | **Default**: Route Handlers, RSC, Server Actions |
   | `createServiceSupabaseClient()` | Bypassa RLS. Solo tareas internas. **Nunca en `src/app/`**. |

7. **Migraciones inmutables.** `supabase/migrations/0001_foundation.sql` no se modifica.
   Cambios → nueva `000N_*.sql`. Toda tabla `public` tiene RLS habilitado.

8. **Sin dependencias externas no revisadas.** La restricción es USD 0/mes.
   Cualquier nueva dependencia debe ser gratuita y sin API key obligatoria.

## Flujo de datos

```
usuario  ─→  App Router page (RSC, lectura)
              │
              ├─→  Route Handler (api/v1/) — escritura
              │      │
              │      └─→  Client Supabase (user o service)
              │             │
              │             └─→  Supabase Postgres (RLS activo)
              │
              └─→  src/lib/ (validación, cálculos, i18n)
                     │
                     ├─→  validations/ (Zod schemas)
                     ├─→  calculations/ (funciones puras)
                     ├─→  csv/ (parsers → registry → validation)
                     ├─→  market-data/ (providers Yahoo, Stooq, open.er-api)
                     └─→  i18n/ (diccionarios español)
```

## Qué NO hacer

- No llamar `.insert`/`.update`/`.delete` de Supabase desde RSC.
- No importar `SUPABASE_SERVICE_ROLE_KEY` en client components ni prefijar con `NEXT_PUBLIC_`.
- No mezclar lógica de negocio en componentes (`src/components/` y `src/features/` son UI).
- No hardcodear strings de UI; usar `src/lib/i18n/*.ts`.
- No usar `number` para dinero en el wire; siempre `string`.
- No crear `tailwind.config.*`; Tailwind v4 usa `@theme` en `globals.css`.
- No modificar `0001_foundation.sql`; crear nueva migración numerada.
- No asumir que existe un portafolio "Default"; el sistema usa `portfolio_members`.
