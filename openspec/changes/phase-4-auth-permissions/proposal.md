## Why

La aplicación corre hoy con un cliente Supabase de service role que bypasea todas las RLS: cualquier request lee y escribe todos los trades de todos los usuarios. El schema ya tiene `profiles`, `portfolios` y `portfolio_members`, pero la columna `portfolios.user_id` está parcialmente usada y la tabla `portfolio_members` no aparece en ninguna policy. Para que el proyecto deje de ser single-user accidentalmente, hay que activar Supabase Auth, forzar que cada request pase por RLS, y dejar la base lista para compartir portafolios en V2.1.

## What Changes

- Activar Supabase Auth con magic link por email.
- Crear perfil + portafolio "Mi portafolio" + fila OWNER en `portfolio_members` para cada usuario nuevo, vía trigger SQL.
- Reescribir todas las RLS para que pasen por funciones que consultan `portfolio_members` (en lugar de `portfolios.user_id` directo).
- Reemplazar el server client actual (service role) por un cliente user-scoped basado en `@supabase/ssr`. El service role queda relegado a tareas internas.
- Proteger todas las rutas (App Router y Route Handlers) con un middleware y un helper `requireUser`/`requireApiUser`.
- Eliminar la lógica de auto-creación del portafolio "Default" en los endpoints de trades y CSV.
- Adaptar el test E2E para que valide el redirect a `/login`.

## Capabilities

### New Capabilities

- `auth-and-membership`: signup por magic link, gestión de sesión en cookies vía `@supabase/ssr`, perfil auto-creado, portafolio "Mi portafolio" auto-creado y membresía OWNER via trigger SQL, helpers `getCurrentUser`/`requireUser`/`getCurrentPortfolio`, gate por middleware + helper, signout.
- `portfolio-rls`: funciones SQL `current_user_is_member` y `current_user_has_role`; reescritura de todas las policies de `portfolios`, `portfolio_members`, `trades`, `csv_imports`, `csv_import_rows`, `portfolio_snapshots`, `alerts`, `alert_events`, `audit_events` para que descansen sobre `portfolio_members`. Mantiene `profiles` con la policy original.

### Modified Capabilities

- (vacío — no hay specs previas en el repo)

## Impact

- **DB**: nueva migración `supabase/migrations/0003_auth_and_permissions.sql`. No se toca `0001` ni `0002`. Cambian todas las policies activas: cualquier consumer de la API actual queda bajo RLS por primera vez.
- **Dependencias**: se agrega `@supabase/ssr` a `package.json`.
- **API**: los 9 Route Handlers existentes (`trades/*`, `imports/*`, `dashboard/*`) cambian de cliente y de cómo derivan el `portfolio_id`. Se elimina el fallback "Default". Se agrega un 401 uniforme.
- **UI**: nueva página `/login`, página `/auth/error`, componente `user-menu`, ajuste del `MainNavigation`. Strings nuevos en `src/lib/i18n/auth.ts`.
- **Config**: `.env.example` documenta `NEXT_PUBLIC_SITE_URL` para los redirects del magic link.
- **Tests**: extiende `src/supabase/migrations/schema.test.ts`; nuevo `auth.test.ts` que valida el trigger con PGlite; E2E `tests/e2e/home.spec.ts` se reescribe para esperar redirect a `/login`.
- **Operaciones**: el portafolio huérfano del MVP (donde `portfolios.user_id IS NULL`) queda accesible únicamente a su primer dueño vía el trigger de Auth — no hay flujo de "claim" porque el alcance actual asume "borrar y empezar de cero". Documentar en README/AGENTS la limpieza de dev si se quiere sembrar datos.

## Out of scope (V2.1 / Phase 4.1)

- UI de `/settings/members` y roles EDITOR/VIEWER activos (schema y funciones quedan listas, sólo hay que cambiar las policies de `current_user_has_role(id, 'OWNER')` a `in ('OWNER','EDITOR')` en el subset correspondiente).
- Multi-portfolio y portfolio switcher.
- Edición de perfil (`full_name`, `locale`).
- Poblar `audit_events.actor_user_id` con `auth.uid()`.
