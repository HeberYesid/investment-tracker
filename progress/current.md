# Sesion actual

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
