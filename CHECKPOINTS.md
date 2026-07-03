# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.

## C1 — El arnés está completo

- [ ] Existen los 7 archivos base: `AGENTS.md`, `init.mjs`, `feature_list.json`,
      `progress/current.md`, `docs/architecture.md`, `docs/conventions.md`,
      `docs/verification.md`.
- [ ] Existe `CHECKPOINTS.md` (este archivo).
- [ ] `node init.mjs` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] Toda feature `done` tiene su código implementado en las rutas esperadas.
- [ ] `progress/current.md` está vacío o describe la sesión activa
      (no contiene basura de sesiones anteriores).

## C3 — El código respeta la arquitectura

- [ ] `src/app/` solo contiene App Router pages, layouts, y Route Handlers (`api/v1/`).
      No hay lógica de negocio directa en pages/Route Handlers.
- [ ] `src/lib/` contiene toda la lógica de negocio (validaciones Zod, clientes Supabase,
      parsers CSV, cálculos, i18n). No hay imports de `src/app/` desde `src/lib/`.
- [ ] `src/components/` solo contiene UI primitives (`ui/`) y componentes de layout/charts.
      No hay lógica de negocio en componentes.
- [ ] `src/features/` contiene feature-level components (new-trade, edit-trade, import, etc.).
      Cada feature tiene su carpeta dedicada.
- [ ] `src/middleware.ts` gestiona session refresh + auth gate. No hay auth checks inline.
- [ ] `supabase/` contiene migraciones numeradas (`000N_*.sql` inmutables una vez aplicadas)
      y Edge Functions Deno. No hay lógica de negocio de la app en Edge Functions.
- [ ] Strings de UI en `src/lib/i18n/*.ts`. Sin copy hardcodeado en componentes.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` nunca en `NEXT_PUBLIC_*` ni en client components.
- [ ] Tailwind v4: config via `@theme` en `src/app/globals.css`. No existe `tailwind.config.*`.

## C4 — La verificación es real

- [ ] `pnpm test:run` pasa (Vitest unit).
- [ ] `pnpm exec tsc --noEmit` pasa (typecheck).
- [ ] `pnpm lint` pasa (ESLint).
- [ ] `pnpm build` pasa (build de Next.js).
- [ ] Los tests unit usan fixtures reales cuando corresponde (e.g. CSVs de muestra en
      `tests/fixtures/csv/`), no mocks que esconden bugs.
- [ ] Tests E2E (Playwright) existen para flujos críticos (login, dashboard, trades).

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (`*.tmp`, `*.log`, `.env` sin `.example`).
- [ ] No hay `console.log`/`console.error` de debug sin eliminar.
- [ ] `progress/history.md` tiene una entrada por la última sesión.
- [ ] La última feature trabajada está reflejada en su estado correcto en `feature_list.json`.
- [ ] `progress/current.md` está vacío (salvo la plantilla).

## C6 — Spec Driven Development

- [ ] Toda feature con `"sdd": true` en estado `spec_ready`, `in_progress`
      o `done` tiene una carpeta `openspec/changes/<name>/` con los 3 archivos:
      `proposal.md`, `design.md`, `tasks.md`.
- [ ] `proposal.md` define requirements numeradas (`R1`, `R2`, ...) en notación EARS.
- [ ] Toda feature `done` con `"sdd": true` tiene todas sus tasks marcadas
      `[x]` en `tasks.md`.
- [ ] Cada `R<n>` de `proposal.md` está cubierto por al menos un test concreto
      en `tests/`.
- [ ] La trazabilidad `R<n> → test` está documentada en `progress/impl_<name>.md`.

---

**Cómo usar este archivo:** un agente revisor recorre cada checkbox, marca `[x]` o `[ ]`,
y rechaza el cierre de sesión si quedan boxes vacíos en C1-C6.
