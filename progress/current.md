# Sesion actual

## Decisión vigente de precios — 2026-11-22

- Por decisión del titular, Yahoo es la única fuente de nuevas cotizaciones. Si falla, se conserva la última disponible y se mantiene el aviso de antigüedad. El respaldo automático y la importación local de Stooq salen de los pendientes; ni las diez cotizaciones ni las dos muestras son acciones abiertas. Consulta el [ADR 010](../docs/adr/010-mercado.md) y el catálogo para el estado vigente.

## Historial del ensayo Yahoo → Stooq — 2026-11-21 a 2026-11-22

- Pausada por solicitud del usuario para liberar el turno de implementación. Estado `blocked` (no hay estado `paused` en el catálogo); 38/41 tareas, sin cambios descartados. Para retomar: validar el mapeo real de Stooq (2.3) y resolver el arranque de Supabase efímero sin relajar los permisos de `0015` (`42501`, el ejecutor no puede asumir `asset_catalog_writer`), luego ejecutar el smoke de Supabase (5.4) y E2E (9.4).
- `node init.mjs`: entorno listo, 629 pruebas verdes; OpenSpec registra 0/41 tareas completadas.
- Corrección de R4 aprobada: sin migración ni `CHECK` nuevo. La prueba PGlite en `src/__tests__/migrations/schema.test.ts` confirma las cinco fuentes (1.1–1.2).
- Fallback por símbolo implementado en `sync-prices` para activos estadounidenses mapeados. Evidencia y pendientes en `progress/impl_market-data-resilience-and-disclosure.md`. No se dispararon sincronizaciones ni se desplegó.
- Correcciones aprobadas: diagnóstico agregado sin errores crudos y acotado al portafolio activo; Stooq limitado a cotizaciones verificadas en USD. Se retoma el cambio desde 3/41 tareas y una base de 634 pruebas verdes.
- Segunda etapa: 38/41 tareas. `node init.mjs` pasó con 662 pruebas; TypeScript, lint (4 avisos previos, 0 errores) y OpenSpec pasaron. `pnpm build` pasó con CSS de fuentes simulado. Next de producción y Chromium confirmaron caché, aviso e indicador de fuente con sesión y backend sintéticos. Deno 2.8.3 desde caché pasó el chequeo estático de ambos workers tras corregir la inferencia del cliente. Quedan mapeo real (2.3), Edge Function en Supabase local (5.4) y suite E2E con ese backend (9.4). No se desplegó ni se lanzaron sincronizaciones.
- El smoke `supabase/functions/sync-prices/smoke_test.ts` pasó en Deno 2.8.3 usando el handler real y el cliente Supabase contra HTTP simulado, sin permiso `--allow-net`. Comprueba persistencia de `STOOQ`, doble fallo sin modificar la caché y el desglose. No sustituye al runtime alojado de Supabase. Docker Desktop está instalado pero su motor está detenido.
- Preparada `tests/e2e/market-data-disclosure.spec.ts`: usa Mailpit y Supabase efímeros en loopback, siembra solo datos sintéticos y bloquea el POST de sincronización del navegador. Pasaron TypeScript, ESLint dirigido y el listado de Playwright. `node scripts/ci-e2e/run.mjs --prepare-only` falló en el preflight de Docker, antes de crear el stack. No se comprobó la ejecución de la nueva prueba.
- 2026-11-22: Docker disponible; se reprodujo el arranque descartable con las migraciones originales hasta 0016, sin cambiar permisos, y el build pasó. La base compartida pasó `node init.mjs` con 746 pruebas. La validación en Stooq sigue sin autorización de red; el CSV y la moneda simulados no acreditan el proveedor real.
- 2026-11-22: **40/41**. Pasaron el worker en Supabase Edge Runtime con PostgreSQL real y proveedores simulados (5.4), y Playwright móvil con Supabase, correo y Auth locales (9.4). Único pendiente de la spec: comprobar el mapeo real de Stooq (2.3). No hubo consultas remotas, despliegue ni cambios de roles.
- 2026-11-22: validación pública autorizada, sin credenciales ni datos de portafolio. `stooq.com/q/l/` devolvió 404 HTML para los 10 símbolos; la ruta histórica de AAPL devolvió 200 con verificación de navegador, no CSV. 2.3 sigue bloqueada: no se pudo validar precio, moneda ni hora de Stooq real. No activar el fallback en producción con esta evidencia.

## Piloto de CI/CD — 2026-11-22

- `add-cicd-pilot` queda `in_progress`, 7/8: arranque automático desbloqueado y regla de merge verificada en GitHub. Evidencia y trazabilidad: `progress/impl_add-cicd-pilot.md`.
- PR borrador #2 en `test/ci-pilot`, sin cambios en `main`. Vercel excluido solo en esa rama; Supabase Preview omitido y sin despliegues registrados. Roja `45068952912` (`80bf250`) por esperar USD 21; verde `45069227357` (`48764e4`) con USD 20 y 5/5 E2E sin omisiones.
- `test/ci-pilot-base`, excluida de Vercel, tiene la regla activa `27858130` limitada a esa rama. El PR #3 pasó de `BLOCKED` con `4be33a3` (USD 21) a `CLEAN` con `18764ce` (USD 20, 5/5 E2E). No se fusionó ni se registraron despliegues; `main` conserva SHA y reglas.
- Pendientes: ensayar la recuperación en un destino aislado autorizado y completar revisión independiente. Las ramas, PRs y regla de prueba quedan disponibles como evidencia.

## Contexto histórico conservado

- **Feature en curso:** _bugfix: sesion no persiste tras magic link (callback) + gating demo_
- **Inicio:** 2026-07-23
- **Agente:** opencode

## Plan

1. Diagnosticar por que tras magic link la sesion es anonima (nav "Iniciar sesion", no "Salir")
2. Fix principal: reescribir `auth/callback/route.ts` con cookies atadas a la response
3. Documentar el catch silencioso en `server.ts`
4. Verificar env
5. Tests del callback
6. Verificacion completa

## Bitacora

### Bugfix — Sesion no persistida tras magic link ✓

**Sintoma reportado:** al colocar correo y hacer click en el enlace magico del email, el usuario aterriza en `/` mostrando el demo (nav dice "Iniciar sesion" → no logueado).

**Diagnostico:** la nav muestra "Iniciar sesion" tras el magic link → sesion anonima. Confirmado: el `exchangeCodeForSession` en el callback de auth NO persiste las cookies de sesion adecuadamente en Next.js 16.

**Causa raiz:** `src/app/auth/callback/route.ts` usaba `createUserSupabaseClient()` (next/headers cookies + `try/catch` silencioso en `setAll`). En un Route Handler que retorna su propio `NextResponse.redirect()`, las cookies escritas via `next/headers` `cookies().set()` pueden no propagarse al response saliente en Next 16. El `catch` silencioso en `server.ts:25` ocultaba el fallo.

**Cambios:**

1. **`src/app/auth/callback/route.ts`** — reescrito con el patron canónico de `@supabase/ssr` para Route Handlers:
   - Construye `response = NextResponse.redirect(origin + next)` primero.
   - Crea `createServerClient` con cookies `getAll → request.cookies.getAll()` y `setAll → response.cookies.set(...)`.
   - `exchangeCodeForSession` escribe las auth-cookies directamente en la response devuelta.
   - En caso de error, redirige a `/auth/error` con una response separada (sin cookies de sesion).
   - Validacion de env vars ausentes.

2. **`src/lib/supabase/server.ts`** — comentario del `catch` en `setAll` actualizado para documentar que solo aplica a Server Components; Route Handlers que muten sesion deben usar response-bound cookies.

3. **Test nuevo `src/__tests__/auth/callback.test.ts`** — 13 tests cubriendo:
   - exito → redirect con cookies de sesion en la response
   - error expired / invalid → redirect a `/auth/error?reason=...`
   - code ausente → `/auth/error?reason=missing_code`
   - env vars ausentes → `/auth/error?reason=missing_code`
   - sanitizacion del parametro `next` (open redirect prevention)
   - Mock de `@supabase/ssr` que simula el write de cookies via setAll

**Nota env:** `.env.local` no tiene `NEXT_PUBLIC_SITE_URL`. El login form usa `window.location.origin` como fallback, lo cual funciona en local. Para deploy recomendado setearlo como indica `.env.example`.

**Follow-ups identificados (fuera de alcance de este fix):**
- Lazo `/login↔/` cuando usuario esta logueado pero sin `portfolio_members` row (trigger 0003 no corrio para el). El gating de la home en `dashboard-data-loader.tsx` no distingue "logueado sin portafolio" de "anonimo" — ambos caen al demo. Se necesita un guard/provisioning idempotente.
- Signout route usa `createUserSupabaseClient` con el mismo catch silencioso; si `cookieStore.set()` falla en Route Handlers, el signout seria silenciosamente inefectivo. Evaluar migrar signout al mismo patron response-bound.

## Verificacion final
- `pnpm test:run`: 58 files, 554 tests — TODOS pasan (13 nuevos)
- `pnpm exec tsc --noEmit`: TypeScript sin errores
- `pnpm build`: Next.js 16.2.10 build exitoso
- `node init.mjs`: [OK]
