---
description: Orchestrate fixing a bug — reproduce it as a failing regression test, fix to green, review, gated commit
agent: general
subtask: true
---

# Orchestrate: Fix Defect

Manually launch a red-test-first bug-fix pipeline. Prove the bug exists, then make it go away.

**Input**: $ARGUMENTS — what is broken. If empty, ask the user to describe the defect.

## Project Context

- Next.js 15 App Router + React 19 + Supabase + pnpm
- Test runner: Vitest (jsdom), `pnpm test:run`
- Typecheck: `pnpm exec tsc --noEmit`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Existing proposal workflow: `openspec/changes/<id>/`

## Pipeline

1. **Classify** size (default floor: small, often trivial). If the root cause is unclear, use the `explore` agent to scope it first.
2. **Write a new failing regression test** that reproduces the bug. Run `pnpm test:run` and confirm it goes red. Then fix the implementation until the test goes green.
   - Writing the test *first* is what makes this a fix rather than a tweak.
3. **Review** the diff. If the defect sits on a security-sensitive path (auth, RLS, money, file uploads, deserialization), do an extra security pass.
4. **Commit** as a conventional `fix:` commit. → **GATE 2** — confirm before committing.

## Boundaries

Use this command only when behavior is **broken or wrong**. Do NOT use it for:
- Intentional changes (use `/orch-change-feature`)
- Net-new capability (use `/orch-add-feature`)

## Output

When done, report:
- The regression test added
- The implementation fix
- Lint + typecheck + build status
- Commit hash and message
- Suggested follow-up: openspec change if user-facing, or CHANGELOG note
