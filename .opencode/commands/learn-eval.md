---
description: Extract reusable patterns from the session, self-evaluate quality before saving, and determine the right save location.
---

# Learn + Evaluate — Extract with Quality Gate

Like `/learn`, but with a structured quality gate, save-location decision, and content-overlap check before writing any skill file.

## What to Extract

Look for:

1. **Error Resolution Patterns** — root cause + fix + reusability
2. **Debugging Techniques** — non-obvious steps, tool combinations
3. **Workarounds** — library quirks, API limitations, version-specific fixes
4. **Project-Specific Patterns** — conventions, architecture decisions, integration patterns

## Process

### 1. Identify the pattern

Review the session for extractable patterns. Pick the most valuable/reusable insight.

### 2. Determine save location

- **Project** (`.opencode/skills/learned/`): project-specific knowledge — quirks of a particular config file, architecture decisions, integration patterns. **Default for this repo.**
- **Global** (`~/.config/opencode/skills/learned/`): generic patterns usable across 2+ projects (bash compatibility, LLM API behavior, debugging techniques, etc.)
- When in doubt, choose **project** (moving project → global is easier than the reverse).

### 3. Draft the skill file

```markdown
---
name: pattern-name
description: Under 130 characters
---

# [Descriptive Pattern Name]

**Extracted:** [YYYY-MM-DD]
**Context:** [Brief description of when this applies]

## Problem
[What problem this solves — be specific]

## Solution
[The pattern/technique/workaround — with code examples]

## When to Use
[Trigger conditions]
```

### 4. Quality Gate — Checklist + Holistic Verdict

**4a. Required checklist** (verify by reading files, not by memory):

- [ ] Grep `.opencode/skills/` and `~/.config/opencode/skills/` by keyword for content overlap
- [ ] Check `AGENTS.md` and `README.md` for overlap
- [ ] Consider whether appending to an existing skill would suffice
- [ ] Confirm this is a reusable pattern, not a one-off fix

**4b. Holistic verdict** — pick one:

| Verdict | Meaning | Next Action |
|---|---|---|
| **Save** | Unique, specific, well-scoped | Proceed to Step 5 |
| **Improve then Save** | Valuable but needs refinement | List improvements → revise → re-evaluate (once) |
| **Absorb into [X]** | Should be appended to an existing skill | Show target skill and additions → Step 5 |
| **Drop** | Trivial, redundant, or too abstract | Explain reasoning and stop |

**Guideline dimensions** (inform the verdict, do not score):

- **Specificity & Actionability** — code examples or commands that are immediately usable
- **Scope Fit** — name, trigger conditions, and content are aligned and focused on a single pattern
- **Uniqueness** — provides value not covered by existing skills
- **Reusability** — realistic trigger scenarios in future sessions

### 5. Verdict-specific confirmation flow

- **Save**: present save path + checklist results + 1-line verdict rationale + full draft → save after user confirmation
- **Improve then Save**: present required improvements + revised draft + updated checklist/verdict after one re-evaluation → if revised verdict is Save, save after user confirmation, otherwise follow the new verdict
- **Absorb into [X]**: present target path + additions (diff format) + checklist results + verdict rationale → append after user confirmation
- **Drop**: show checklist results + reasoning only (no confirmation needed)

### 6. Save / Absorb to the determined location

## Design Rationale

This version uses a checklist + holistic verdict rather than numeric scoring. Modern frontier models have strong contextual judgment — forcing rich qualitative signals into numeric scores loses nuance and can produce misleading totals.

## Notes

- Don't extract trivial fixes.
- Don't extract one-time issues.
- Focus on patterns that will save time in future sessions.
- Keep skills focused — one pattern per skill.
- When the verdict is Absorb, append to the existing skill rather than creating a new file.
