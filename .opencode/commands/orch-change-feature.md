---
description: Orchestrate altering an existing, working feature to new desired behavior — update tests to the new spec, change impl, review, gated commit
agent: general
subtask: true
---

# Orchestrate: Change Feature

Manually launch a tests-first change pipeline for behavior that already works but should behave differently.

**Input**: $ARGUMENTS — the new desired behavior. If empty, ask the user what should change.

## Project Context

- Next.js 15 App Router + React 19 + Supabase + pnpm
- Test runner: Vitest (jsdom), `pnpm test:run`
- Typecheck: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Existing proposal workflow: `openspec/changes/<id>/`

## Pipeline

1. **Classify** size (default floor: small) and state the tier.
2. **Light plan** only if the new behavior needs research into patterns or libraries. → **GATE 1** — get user approval of the changed-test plan before editing tests.
3. **Update the existing tests** to express the new behavior. Watch them go red. Then change the implementation until green.
   - Changing the tests *first* is what makes this a "tweak" rather than a "fix" — keep the user-visible intent.
4. **Review** the diff. If a security-sensitive surface is touched, do an extra security pass.
5. **Commit** as a conventional `refactor:` or `feat:` commit (pick the dominant type). → **GATE 2** — confirm before committing.

## Boundaries

Use this command only when the feature **works** but should behave differently. Do NOT use it for:
- Bugs (use `/orch-fix-defect`)
- Net-new capability (use `/orch-add-feature`)

## Output

When done, report:
- Tests updated and the red → green transition
- Implementation files changed
- Lint + typecheck + build status
- Commit hash and message
