---
description: Multi-perspective PR review — correctness, types, security, tests, simplicity
agent: general
subtask: true
---

# Review PR

Run a multi-perspective review of a pull request, focused on the highest-signal issues only.

**Input**: $ARGUMENTS — optional PR number / URL. If empty, review the current branch's diff (`git diff origin/main..HEAD`).

## Workflow

### 1. Identify the diff

```bash
# If $ARGUMENTS contains a PR number or URL
gh pr view $1 --json number,title,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff $1

# Otherwise
git diff origin/main..HEAD --stat
git diff origin/main..HEAD
```

### 2. Find project guidance

Read `AGENTS.md` and `README.md` to learn the project's conventions before reviewing.

### 3. Apply review lenses

For each changed file, evaluate:

| Lens | Look for |
|---|---|
| **Correctness** | Logic errors, off-by-ones, null handling, edge cases, race conditions, async/await correctness |
| **Type safety** | `any` leakage, unsafe casts, missing generics, Zod schema drift |
| **Pattern compliance** | Naming, file structure, error handling (`src/lib/api/errors.ts` contract), imports, RSC vs Route Handler boundaries |
| **Security** | Injection, auth gaps, secret exposure, SSRF, path traversal, XSS, RLS policies, service-role key exposure |
| **Tests** | Coverage of new code, edge cases, regression risk, mocking style |
| **Performance** | N+1 queries, missing indexes, unbounded loops, large payloads, unnecessary re-renders |
| **i18n** | Hardcoded user-facing strings (must live in `src/lib/i18n/*.ts`) |
| **Cost** | New paid services, heavy computations, large bundle additions (project is USD 0/month) |
| **Simplicity** | Unnecessary abstraction, dead code, over-engineering |

### 4. Dedupe and rank

Deduplicate overlapping findings. Rank by severity. **Only report issues with confidence ≥ 80%** — skip nitpicks unless explicitly asked.

### 5. Aggregate report

```markdown
# PR Review: <number or branch>

**Branch:** <head> → <base>
**Files:** <count> (+<additions> -<deletions>)

## Findings

### CRITICAL
- <path:line> — <issue> → <fix>

### HIGH
- <path:line> — <issue> → <fix>

### MEDIUM
- <path:line> — <issue> → <fix>

### LOW
- <path:line> — <issue> → <fix>

## Validation
- pnpm lint: <pass / fail / skipped>
- pnpm exec tsc --noEmit: <pass / fail / skipped>
- pnpm test:run: <pass / fail / skipped>
- pnpm build: <pass / fail / skipped>

## Recommendation
<APPROVE | REQUEST_CHANGES | BLOCK>
```

### 6. Post to GitHub (only if PR number was given)

```bash
gh pr review <NUMBER> --approve --body "<summary>"
# or
gh pr review <NUMBER> --request-changes --body "<summary with required fixes>"
```

## Confidence Rule

Critical: bugs, security, data loss → always report.
Important: missing tests, quality problems, style violations → report if confident.
Advisory: suggestions → only when explicitly asked.

Skip nitpicks like import ordering, naming bikesheds, or formatting that the linter already enforces.
