---
description: Orchestrate altering an existing, working feature to new desired behavior — spec-driven via spec-author → implementer → reviewer
agent: general
subtask: true
---

# Orchestrate: Change Feature

Pipeline spec-driven para modificar el comportamiento de una feature existente.
Sigue el flujo SDD del proyecto: `pending → spec_ready → ⏸ humano → in_progress → done`.

**Input**: $ARGUMENTS — la feature y el nuevo comportamiento deseado. Si está vacío, pregunta al usuario.

## Project Context

- Next.js 15 App Router + React 19 + Supabase + pnpm
- Test runner: Vitest (jsdom), `pnpm test:run`
- Typecheck: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Build: `pnpm build`
- SDD workflow: `openspec/changes/<id>/` con EARS requirements en `proposal.md`
- Ver `docs/specs.md` para el proceso completo

## Pipeline

1. **Arranque:** ejecuta `node init-quick.mjs`; confirma la feature y el worktree asignados, y consulta solo su entrada en `feature_list.json`.
2. **Ruta según estado:**
   - `pending` / no existe → Lanzar `spec-author` para crear/actualizar `openspec/changes/<name>/` con los nuevos requirements EARS.
   - `spec_ready` → **PARAR.** "Spec listo en `openspec/changes/<name>/`. Revísalo y di **'aprobado'** para continuar."
   - `in_progress` → Consultar **Para retomar** en `progress/impl_<name>.md` y reanudar con `implementer` en el worktree asignado.
3. **Aprobación humana (GATE 1):** El `spec-author` transiciona a `spec_ready`. El flujo se **detiene** hasta que el humano diga "aprobado".
4. **Implementación:** Post-aprobación, el leader transiciona a `in_progress` y lanza `implementer` (TDD: test primero → verde, tasks marcadas `[x]`, trazabilidad en `progress/impl_<name>.md`).
5. **Review:** El `reviewer` aplica `CHECKPOINTS.md`, verifica trazabilidad y tareas, y ejecuta `node init-full.mjs` antes de aprobar el cierre.
6. **Cierre:** Si la revisión está aprobada y la verificación completa pasó, marca solo la feature asignada como `done` y añade el resumen con evidencia al final de `progress/history.md`. Si queda pendiente, actualiza **Para retomar**.
7. **Commit** como `refactor:` o `feat:` (dominante). → **GATE 2** — confirmar antes de commitear.

## Hard Gates

- **GATE 1:** NO implementar sin spec aprobado por el humano.
- **GATE 2:** NO commitear sin confirmación del usuario.
- El `leader` NUNCA edita `src/` ni `tests/`.
- Usar este comando solo para features que **funcionan** pero deben comportarse diferente. No para bugs (`/orch-fix-defect`) ni features nuevas (`/orch-add-feature`).

## Output

Cuando termines, reporta:
- Feature y estado final en `feature_list.json`
- Spec actualizado en `openspec/changes/<name>/`
- Trazabilidad en `progress/impl_<name>.md`
- Revisión en `progress/review_<name>.md`
- Resultado de `node init-full.mjs` si se verificó el cierre
- Commit hash y mensaje (si aplica)
