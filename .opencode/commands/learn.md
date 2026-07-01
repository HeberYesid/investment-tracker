---
description: Extract reusable patterns from the current session and save them as candidate skills or guidance.
---

# Learn — Extract Reusable Patterns

Analyze the current session and extract any patterns worth saving as a skill for this project.

**Trigger**: Run `/learn` at any point during a session when you've solved a non-trivial problem.

## What to Extract

Look for:

1. **Error Resolution Patterns** — what error occurred, root cause, fix, and whether it is reusable for similar errors
2. **Debugging Techniques** — non-obvious steps, tool combinations, diagnostic patterns
3. **Workarounds** — library quirks, API limitations, version-specific fixes
4. **Project-Specific Patterns** — codebase conventions, architecture decisions, integration patterns

## Where to Save

Save skills to the project's skills directory:

```
.opencode/skills/learned/<pattern-name>.md
```

This mirrors the project's existing `.opencode/skills/` layout (`openspec-propose`, `openspec-apply-change`, etc.) and keeps extracted knowledge co-located with the project.

## Output Format

Create a skill file at `.opencode/skills/learned/[pattern-name].md`:

```markdown
# [Descriptive Pattern Name]

**Extracted:** [YYYY-MM-DD]
**Context:** [Brief description of when this applies]

## Problem
[What problem this solves — be specific]

## Solution
[The pattern/technique/workaround]

## Example
[Code example if applicable]

## When to Use
[Trigger conditions — what should activate this skill]
```

## Process

1. Review the session for extractable patterns.
2. Identify the most valuable and reusable insight.
3. Draft the skill file.
4. Ask the user to confirm before saving.
5. Save to `.opencode/skills/learned/`.

## Notes

- Do not extract trivial fixes (typos, simple syntax errors).
- Do not extract one-time issues (specific API outages, etc.).
- Focus on patterns that will save time in future sessions.
- Keep skills focused — one pattern per skill.
