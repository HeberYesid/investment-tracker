---
description: Orchestrate building a brand-new feature end to end — research, plan, TDD, review, gated commit
agent: general
subtask: true
---

# Orchestrate: Add Feature

Manually launch a gated Research → Plan → TDD → Review → Commit pipeline for net-new capability in this project.

**Input**: $ARGUMENTS — the feature to add. If empty, ask the user what capability to add.

## Project Context

- Next.js 15 App Router + React 19 + Supabase + pnpm
- Test runner: Vitest (jsdom), `pnpm test:run`
- Typecheck: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Existing proposal workflow: `openspec/changes/<id>/` (use `openspec` CLI for proposals, not manual files)
- i18n: strings live in `src/lib/i18n/*.ts` — no hardcoded copy in components

## Pipeline

1. **Arranque:** ejecuta `node init-quick.mjs`; confirma la feature y el worktree asignados, y consulta solo su entrada en `feature_list.json`. Si no existe, clasifícala como nueva feature.
2. **Ruta según estado:**
   - `pending` → Lanzar `spec-author` (crea spec EARS en `openspec/changes/<name>/`, transiciona a `spec_ready`).
   - `spec_ready` → **PARAR.** La puerta de aprobación humana está cerrada. Decir: "Spec listo en `openspec/changes/<name>/`. Revísalo y di **'aprobado'** para continuar, o pídeme cambios."
   - `in_progress` → Consultar **Para retomar** en `progress/impl_<name>.md` y reanudar con `implementer` en el worktree asignado.
3. **Spec → Aprobación humana (GATE 1):** Cuando el `spec-author` termina, la feature queda en `spec_ready`. El flujo se **detiene**. NO continuar sin que el humano diga "aprobado".
4. **Implementación (post-aprobación):** El leader transiciona `spec_ready → in_progress` y lanza `implementer`. El implementer ejecuta `tasks.md` task por task (TDD: test primero → verde), marca `[x]`, escribe trazabilidad `R<n> → test` en `progress/impl_<name>.md`.
5. **Review:** El `reviewer` aplica `CHECKPOINTS.md`, verifica trazabilidad y tareas, y ejecuta `node init-full.mjs` antes de aprobar el cierre.
6. **Cierre:** Si la revisión está aprobada y la verificación completa pasó, marca solo la feature asignada como `done` y añade el resumen con evidencia al final de `progress/history.md`. Si queda pendiente, actualiza **Para retomar**.
7. **Commit** como `feat:` convencional con mensaje descriptivo. → **GATE 2** — confirmar con usuario antes de commitear.

## Hard Gates

- **GATE 1 — Puerta SDD:** NO escribas código de implementación antes de que el humano apruebe el spec (`spec_ready`). Si la feature está en `pending`, primero lanza `spec-author`.
- **GATE 2 — Puerta de commit:** NO hagas commit sin confirmación explícita del usuario.
- Si una task se desvía del spec aprobado, para y notifica.
- El `leader` NUNCA edita `src/` ni `tests/`. Solo orquesta subagentes.

## Output

Cuando termines, reporta:
- Feature y estado final en `feature_list.json`
- Spec en `openspec/changes/<name>/` (proposal + design + tasks)
- Trazabilidad en `progress/impl_<name>.md`
- Revisión en `progress/review_<name>.md`
- Resultado de `node init-full.mjs` si se verificó el cierre
- Commit hash y mensaje (si aplica)
