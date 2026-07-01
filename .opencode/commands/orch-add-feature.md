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

1. **Classify** the size (small / medium / large) and state the tier in one line.
2. **Research** existing libraries/patterns in this repo (use `explore` agent if needed). Then plan a task list. → **GATE 1** — stop and get user approval of the plan before any implementation.
3. **TDD** each task: write a failing test first, then make it green. Use `pnpm test:run` for verification.
4. **Review** the diff for security, type-safety, and pattern compliance. If a security-sensitive surface is touched, do an extra security pass.
5. **Commit** as a conventional `feat:` commit. → **GATE 2** — confirm with user before committing.

## Hard Gates

- Do not write implementation code before Gate 1 is approved.
- Do not commit before Gate 2 is confirmed.
- If a task starts to drift beyond the approved scope, stop and ask.

## Output

When done, report:
- Files created / modified
- Tests added and pass count
- Lint + typecheck + build status
- Commit hash and message
- Suggested follow-up (PR, openspec sync, etc.)
