# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.

## C1 — El arnés está completo

- [ ] `node init-quick.mjs` termina con código 0 y valida el entorno, los
      archivos base y el catálogo con sus especificaciones.
- [ ] Antes de marcar la feature como `done`, `node init-full.mjs` termina con código 0.

## C2 — El estado es coherente

- [ ] La sesión y el worktree corresponden a una sola feature. Solo se actualiza
      su entrada en `feature_list.json`, aunque haya otras en `in_progress`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] Toda feature `done` tiene su código implementado en las rutas esperadas.
- [ ] Si la feature queda pendiente, `progress/impl_<name>.md` indica qué se
      verificó, qué falta o bloquea y cuál es la siguiente acción autorizada o por autorizar.

## C3 — El código respeta la arquitectura

- [ ] `src/app/` solo contiene App Router pages, layouts, y Route Handlers (`api/v1/`).
      No hay lógica de negocio directa en pages/Route Handlers.
- [ ] `src/lib/` contiene toda la lógica de negocio (validaciones Zod, clientes Supabase,
      parsers CSV, cálculos, i18n). No hay imports de `src/app/` desde `src/lib/`.
- [ ] `src/components/` solo contiene UI primitives (`ui/`) y componentes de layout/charts.
      No hay lógica de negocio en componentes.
- [ ] `src/features/` contiene feature-level components (new-trade, edit-trade, import, etc.).
      Cada feature tiene su carpeta dedicada.
- [ ] `src/proxy.ts` (Next.js 16+) gestiona session refresh + auth gate. No hay auth checks inline.
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
- [ ] Al cerrar la feature, se añade un resumen con enlaces a la evidencia al
      final de `progress/history.md`, sin reescribir entradas de otros trabajos.
- [ ] La feature asignada queda en el estado correcto en `feature_list.json`.

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

**Cómo usar este archivo:** el revisor comprueba los puntos aplicables a la
feature asignada y rechaza el cierre si falta evidencia obligatoria. El líder
registra el estado final y añade la entrada al historial después de la revisión.
