---
description: Capture session context to a project-local handoff document so a future session can resume with full context.
---

# Save Session

Capture everything that happened in this session — what was built, what worked, what failed, what's left — and write it to a dated file so the next session can pick up exactly where this one left off.

> **Note**: opencode automatically persists conversation history. This command writes a *human-readable* handoff document for context that won't fit in a single session, or for handing off to a teammate.

## When to Use

- End of a work session before closing opencode
- Before hitting context limits (run this first, then start a fresh session)
- After solving a complex problem you want to remember
- Any time you need to hand off context to a future session or a teammate

## Process

### 1. Gather context

Before writing the file, collect:
- Read all files modified during this session (use `git diff` or recall from conversation)
- Review what was discussed, attempted, and decided
- Note any errors encountered and how they were resolved
- Check current test/build status

### 2. Create the handoff folder if missing

```bash
mkdir -p .opencode/session-data
```

### 3. Write the handoff file

Path: `.opencode/session-data/YYYY-MM-DD-<short-id>-session.md`

Recommended short-id format: lowercase letters, digits, and hyphens, 8+ characters (e.g., `abc123de`, `frontend-worktree-1`).

### 4. Populate all required sections

```markdown
# Session: YYYY-MM-DD

**Started:** [approximate time if known]
**Last Updated:** [current time]
**Project:** investment-tracker
**Topic:** [one-line summary]

---

## What We Are Building

[1-3 paragraphs: feature, bug fix, or task. Include enough context that someone with zero memory of this session can understand the goal.]

---

## What WORKED (with evidence)

- **[thing that works]** — confirmed by: [test passed, browser verified, build success, etc.]
- If nothing is confirmed working yet: "Nothing confirmed working yet — all approaches still in progress or untested."

---

## What Did NOT Work (and why)

This is the **most important section**. List every approach tried that failed with the EXACT reason so the next session doesn't retry it.

- **[approach tried]** — failed because: [exact reason / error message]
- If nothing failed: "No failed approaches yet."

---

## What Has NOT Been Tried Yet

- [approach / idea]
- If nothing queued: "No specific untried approaches identified."

---

## Current State of Files

| File | Status | Notes |
| --- | --- | --- |
| `path/to/file.ts` | DONE | [what it does] |
| `path/to/file.ts` | IN PROGRESS | [what's done, what's left] |
| `path/to/file.ts` | BROKEN | [what's wrong] |
| `path/to/file.ts` | NOT STARTED | [planned but not touched] |

If no files were touched: "No files modified this session."

---

## Decisions Made

- **[decision]** — reason: [why this was chosen over alternatives]
- If none: "No major decisions made this session."

---

## Blockers & Open Questions

- [blocker / open question]
- If none: "No active blockers."

---

## Exact Next Step

The single most important thing to do when resuming. Be precise enough that resuming requires zero thinking about where to start.

If unknown: "Next step not determined — review 'What Has NOT Been Tried Yet' and 'Blockers' sections."

---

## Environment & Setup Notes (optional)

Only fill if relevant — special commands, env vars, services that need to be running. Skip if standard setup.
```

### 5. Show the file and ask for confirmation

After writing, display the full contents and ask:

```
Session saved to [path]

Does this look accurate? Anything to correct or add before we close?
```

Wait for confirmation. Make edits if requested.

## Notes

- Each session gets its own file — never append to a previous session's file
- The "What Did NOT Work" section is the most critical — future sessions will blindly retry failed approaches without it
- The handoff file is meant to be read by an LLM (or human) at the start of the next session via `/resume-session`
- Use the canonical project-local store: `.opencode/session-data/`
- Do not commit these files unless they describe a multi-day handoff you want tracked; the project's git history captures code state separately
