## Context

El proyecto corre sobre Next.js 15 App Router con Supabase. Hasta ahora, la única forma de hablar con Supabase desde el servidor es `createServerSupabaseClient()` en `src/lib/supabase/server.ts`, que se autentica con la `SUPABASE_SERVICE_ROLE_KEY`. Esa clave bypasea RLS por diseño — todas las policies declaradas en `0001_foundation.sql` existen pero el cliente de la app nunca las atraviesa. Resultado: cualquier request a `/api/v1/trades` o `/api/v1/dashboard/*` ve y muta todos los trades de todos los usuarios.

El schema ya tiene `profiles`, `portfolios` y `portfolio_members` con constraints y FKs. La policy "owners can manage trades" sí existe, pero chequea `portfolios.user_id = auth.uid()` — en la práctica, como el cliente no envía JWT, `auth.uid()` siempre es `null` y la policy devolvería cero filas, salvo que Supabase evalúe `auth.uid()` contra el contexto del cliente actual (no es el caso porque usamos service role).

Tampoco existe UI de login, ni middleware, ni manejo de cookies. Los endpoints de trades y CSV crean/leen un portafolio "Default" compartido para "salvar" la ausencia de auth.

Restricciones duras: USD 0/mes, Vercel Hobby + Supabase Free, sin proveedores pagos, sin SSO/MFA pagos, español en UI.

## Goals / Non-Goals

**Goals:**
- Cada request al servidor lleva un JWT del usuario actual y RLS filtra de verdad.
- Un usuario nuevo, al confirmar el magic link, ya tiene perfil + portafolio "Mi portafolio" + membresía OWNER, sin pasos manuales.
- Toda ruta de la app (páginas y API) está gateada: sin sesión, redirect a `/login` o 401.
- Cero dependencia nueva que cobre: `@supabase/ssr` es open source, mantenido por Supabase.
- Schema listo para que V2.1 sólo tenga que cambiar `'OWNER'` por `('OWNER','EDITOR')` en policies de SELECT, sin nuevas migraciones estructurales.

**Non-Goals:**
- UI de gestión de miembros, invitaciones por email, roles EDITOR/VIEWER activos.
- Multi-portfolio, portfolio switcher.
- Edición de perfil (`full_name`, `locale`), avatar, preferencias.
- Poblar `audit_events.actor_user_id` con `auth.uid()`.
- Migración de datos MVP: el alcance asume "borrar y empezar de cero". Si hay un portafolio huérfano (`user_id IS NULL`), queda sin dueño hasta que el primer signup lo reclame o se borre manualmente.

## Decisions

### 1. Auth: magic link por email (no OAuth, no password)

**Por qué**: el plan de la fase y la respuesta del usuario lo fijaron. Magic link no requiere UI de reset password, no introduce hashing client-side, y Supabase Free lo soporta sin fricción. OAuth con Google agregaría un par de horas de setup de OAuth client y un segundo path de login para mantener.

**Alternativas consideradas**: email+password (más UI), OAuth Google (más setup), ambos (más paths para testear). Magic link solo es el mínimo viable.

### 2. Cliente user-scoped vía `@supabase/ssr`

**Por qué**: `@supabase/ssr` es la librería oficial de Supabase para Next.js App Router, maneja cookies en el servidor y expone el mismo API de `@supabase/supabase-js` en el cliente. Con `createServerClient(url, key, { cookies: { getAll, setAll } })` y un helper que envuelve `next/headers`, cada request arma un cliente con el JWT del usuario y por lo tanto RLS se aplica. El service role se renombra a `createServiceSupabaseClient` y no se usa en rutas de aplicación.

**Alternativas**: implementar cookies a mano (rechazado — más bugs que la lib oficial), mantener service role + chequeo manual en cada ruta (rechazado — más código, más lugares para equivocarse, no escala).

### 3. Trigger SQL en `auth.users` para crear perfil + portafolio + OWNER

**Por qué**: el alta debe ser atómica. Si lo hacemos app-side, hay una ventana donde el usuario existe en `auth.users` pero no tiene perfil, y un request concurrente puede reventar. Un trigger `AFTER INSERT` con `SECURITY DEFINER` resuelve el problema en la base, no necesita código TS, y es idempotente con `ON CONFLICT DO NOTHING`.

**Alternativas**: app-side en el callback de auth (rechazado — race condition, más código, y hay que reusar service role para escribir como el nuevo usuario).

### 4. RLS reescrita usando `portfolio_members` + funciones helper

**Por qué**: queremos que V2.1 sea un cambio mínimo. En lugar de policies que repiten `EXISTS (SELECT 1 FROM portfolio_members WHERE ...)`, centralizamos la lógica en `current_user_is_member(portfolio_id)` y `current_user_has_role(portfolio_id, role)`. Para que esas funciones sean usables dentro de policies con `TO authenticated`, deben ser `SECURITY DEFINER` + `STABLE` y declarar `search_path` para evitar hijack. Por la misma razón, las policies pasan a ser `USING (current_user_has_role(id, 'OWNER'))` en lugar de chequear `user_id` directo. `profiles` se queda como está (siempre `auth.uid() = id`).

**Alternativas**: dejar las policies originales y agregar las de `portfolio_members` en paralelo (rechazado — duplicación, riesgo de políticas contradictorias). Reescribir en V2.1 (rechazado — trabajo doble, sin beneficio claro).

### 5. Middleware + helper `requireUser`/`requireApiUser`

**Por qué**: el middleware cubre el redirect de páginas y refresca la sesión en cada request (patrón canónico de `@supabase/ssr`). El helper server-side es defensa en profundidad: si el middleware se rompe o si una Server Component se renderiza sin pasar por el middleware, igual validamos. Para APIs, `requireApiUser` devuelve `{ user, supabase, response }` para que la ruta haga `if (response) return response` y siga.

**Alternativas**: solo middleware (rechazado — defensa única, fácil olvidar una ruta), solo helper (rechazado — más boilerplate, no refresca sesión centralizadamente).

### 6. Portafolio auto-derivado del usuario, no recibido en query

**Por qué**: la fase actual asume un portafolio por usuario. La query es siempre "el portafolio donde soy OWNER", no un input. El helper `getCurrentPortfolio()` devuelve `{ portfolioId, role, portfolio }` o `null`. Si en el futuro hay multi-portafolio, agregamos `?portfolio_id=` con verificación de membresía — sin breaking change.

**Alternativas**: aceptar `portfolio_id` opcional desde ya (rechazado — YAGNI, agrega superficie de validación sin uso real).

### 7. Limpieza de fallback "Default"

**Por qué**: las rutas `POST /api/v1/trades` y `POST /api/v1/imports/csv/preview` buscan/crean un portafolio `name = 'Default'` para "no fallar" sin auth. Con auth en su lugar, el portafolio del usuario existe siempre (trigger). El fallback deja de tener sentido y se borra.

**Alternativas**: dejarlo y validarlo contra el user actual (rechazado — branch muerto).

### 8. E2E adaptado a `/login`

**Por qué**: el E2E actual visita `/` y espera ver algo. Con auth, `/` redirige a `/login`. El test ahora chequea el redirect y que `/login` muestre el input de email. Probar el flujo completo del magic link requiere un mail catcher, fuera de alcance.

**Alternativas**: skip E2E (rechazado — perdemos el guard de regresión de UI).

## Risks / Trade-offs

- **Trigger reentrante / hijack**: `handle_new_user` declara `SECURITY DEFINER` y `set search_path = public`. Mitigación: el trigger se inserta en una migración versionada; el schema test verifica que la función existe.
- **RLS rota consumidores existentes**: el cambio a user-scoped cierra la puerta a cualquier ruta que asumía bypass. Mitigación: tests E2E + smoke manual de las 9 rutas existentes + lint + build obligatorio antes de cerrar.
- **Service role en código legacy**: si quedan referencias a `createServerSupabaseClient` (nombre viejo) en alguna ruta, el linter no las detecta. Mitigación: grep explícito + cambio de nombre del helper para forzar el update site-by-site.
- **Magic link necesita un `redirectTo` alcanzable**: en dev sin túnel, los redirects a `localhost` funcionan; en deploy, hace falta HTTPS válido configurado en el proyecto Supabase (Auth → URL Configuration). Mitigación: documentar en `.env.example` y en README.
- **PGlite no es Supabase Auth**: el schema test stubbea `auth.uid()` pero no puede simular múltiples usuarios fácilmente. Mitigación: el test de trigger valida la creación idempotente con un único `auth.users` stub; la integración multi-usuario queda como test manual.
- **Trigger en una migración DROP+CREATE de policies**: si el `0003` falla a mitad (por ejemplo, Supabase rechaza el `drop policy` por dependencia), el schema queda inconsistente. Mitigación: la migración está escrita en bloques idempotentes y se ejecuta contra una instancia limpia en CI antes de mergear. Si pasa en local y rompe en prod, el rollback es "aplicar el `0001` original recreando las policies" — un script en `supabase/migrations/` documenta el camino.
- **El `portfolios.user_id` queda redundante con `portfolio_members`**: lo conservamos porque (a) ya está en la tabla, (b) sirve como "owner primario" para queries de "mis portafolios" sin join, (c) es la columna que el trigger setea. La RLS no la lee.

## Migration Plan

Despliegue:
1. Mergear PR con código + migración.
2. En el proyecto Supabase real, confirmar que Auth está habilitado y el redirect URL incluye `NEXT_PUBLIC_SITE_URL/auth/callback`.
3. Aplicar `0003` con `supabase db push` (o aplicar manualmente en SQL editor).
4. Borrar manualmente cualquier portafolio huérfano: `DELETE FROM public.portfolios WHERE user_id IS NULL;` (y cascada limpia trades/imports asociadas).
5. Desplegar a Vercel.
6. Primer usuario que se loguee tendrá su portafolio creado por el trigger.

Rollback:
- Re-aplicar las policies originales de `0001` (un script `supabase/migrations/0003_rollback.sql` se commitea como referencia pero no se aplica automáticamente).
- `DROP TRIGGER on_auth_user_created ON auth.users;`
- `DROP FUNCTION public.handle_new_user();`
- `DROP FUNCTION public.current_user_is_member(uuid);`
- `DROP FUNCTION public.current_user_has_role(uuid, text);`
- Revertir el código a la versión previa (cambio de cliente Supabase es un commit aislado).

## Open Questions

- ¿El usuario quiere un script de seed/borrado del portafolio huérfano? Por ahora se documenta en README. Si después lo necesita, agregamos un script `scripts/clean-orphan-portfolios.sql` ejecutable manualmente.
- ¿En V2.1 los roles EDITOR/VIEWER tendrán policies que lean `current_user_role(id)` en lugar de `current_user_has_role(id, 'OWNER')`? Sí, ese es el plan implícito. Cuando llegue, hacemos un delta.
- ¿Toca confirmar el SMTP de Supabase? Sí, pero es config del proyecto Supabase, no del código. Se documenta en el README.
