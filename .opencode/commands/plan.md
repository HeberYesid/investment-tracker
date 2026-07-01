---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
agent: plan
subtask: true
---

# Plan

Create a comprehensive implementation plan before writing any code. Accepts free-form requirements or a PRD path.

**Input**: $ARGUMENTS

## What This Command Does

1. **Restate requirements** clearly
2. **Identify risks** and blockers
3. **Create a step plan** broken into phases
4. **Wait for confirmation** — MUST get user approval before any code is written

## When to Use

- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files or components will be affected
- Requirements are unclear or ambiguous

For this project, the **default workflow** is OpenSpec:
- For new capabilities, use `/opsx-propose` to scaffold a change in `openspec/changes/<id>/`
- For implementation, use `/opsx-apply`
- Use `/plan` only for quick ad-hoc planning that does not need proposal tracking

## Input Modes

| Input | Mode | Behavior |
|---|---|---|
| `path/to/name.prd.md` | PRD artifact mode | Read the PRD, pick the next pending delivery milestone, write `openspec/changes/<id>/plans/<name>.plan.md` |
| `path/to/file.md` | Reference mode | Read the file as context, produce an inline plan |
| Free-form text | Conversational mode | Produce an inline plan |
| Empty | Clarification mode | Ask what should be planned |

## Pattern Grounding

Before writing the plan, search the codebase for conventions the implementation should mirror. Capture the top example for each relevant category:

| Category | What to capture |
|---|---|
| Naming | File, function, type, command, or script naming in the affected area |
| Error handling | How failures are raised, returned, logged, or handled (`src/lib/api/errors.ts` is the project's API-error contract) |
| Logging | Levels, format, and what gets logged |
| Data access | Repository, service, query patterns; Supabase client choice (user vs service role) |
| Tests | Test file location, framework, fixtures, assertion style |

If no similar code exists, state that explicitly. Do not invent a pattern.

## Validation Defaults for This Project

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test:run
pnpm build
```

These four gates are the project's contract — every plan must pass them before commit.

## Output Template (inline plan)

```markdown
# Implementation Plan: <Feature Name>

## Requirements Restatement
- <bullet>
- <bullet>

## Implementation Phases

### Phase 1: <name>
- <step>
- <step>

### Phase 2: <name>
- <step>

## Dependencies
- <package / module / service>

## Risks
- HIGH: <risk>
- MEDIUM: <risk>
- LOW: <risk>

## Estimated Complexity: <Small | Medium | Large>
- Implementation: <hours>
- Tests: <hours>
- Review/fix: <hours>
- Total: <range>

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes / no / modify)
```

## Important Rules

- Do **not** write any code until the user explicitly confirms with "yes" / "proceed".
- If the user wants changes, incorporate them and re-present the plan.
- For project work that needs traceability, route through OpenSpec instead of `/plan`.
