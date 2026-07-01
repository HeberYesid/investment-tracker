---
description: Load the most recent handoff document from .opencode/session-data/ and orient fully before doing any work.
---

# Resume Session

Load the last saved handoff document and orient fully before doing any work. The counterpart of `/save-session`.

> **Note**: opencode automatically persists conversation history. This command reads the *human-readable* handoff document written by `/save-session`.

## When to Use

- Starting a new session to continue work from a previous day
- After starting a fresh session due to context limits
- When a teammate hands you a handoff file path
- Any time you have a session document and want the model to fully absorb it before proceeding

## Usage

```
/resume-session                                         # loads most recent file in .opencode/session-data/
/resume-session 2026-07-01                              # loads most recent file for that date
/resume-session .opencode/session-data/2026-07-01-abc123de-session.md   # loads a specific file
```

## Process

### 1. Find the file

If no argument provided:

1. Check `.opencode/session-data/` (project-local)
2. Fall back to `~/.config/opencode/session-data/` (global)
3. Pick the most recently modified `*-session.md` file
4. If no files found, tell the user:
   ```
   No handoff files found in .opencode/session-data/ or ~/.config/opencode/session-data/
   Run /save-session at the end of a session to create one.
   ```
   Then stop.

If an argument is provided:
- If it looks like a date (`YYYY-MM-DD`), search both folders for files matching `YYYY-MM-DD*session.md` and load the most recently modified variant for that date.
- If it looks like a file path, read that file directly.
- If not found, report clearly and stop.

### 2. Read the entire handoff file

Read the complete file. Do not summarize yet.

### 3. Confirm understanding with a structured briefing

```
SESSION LOADED: [actual resolved path to the file]
════════════════════════════════════════════════

PROJECT: investment-tracker

WHAT WE'RE BUILDING:
[2-3 sentence summary in your own words]

CURRENT STATE:
DONE: [count] items confirmed
  In Progress: [list files that are in progress]
  Not Started: [list planned but untouched]

WHAT NOT TO RETRY:
[list every failed approach with its reason — this is critical]

OPEN QUESTIONS / BLOCKERS:
[list any blockers or unanswered questions]

NEXT STEP:
[exact next step if defined in the file]
[if not defined: "No next step defined — recommend reviewing 'What Has NOT Been Tried Yet' together before starting"]

════════════════════════════════════════════════
Ready to continue. What would you like to do?
```

### 4. Wait for the user

Do NOT start working automatically. Do NOT touch any files. Wait for the user to say what to do next.

If the next step is clearly defined in the file and the user says "continue" or "yes" — proceed with that exact next step.

If no next step is defined — ask the user where to start, and optionally suggest an approach from the "What Has NOT Been Tried Yet" section.

## Edge Cases

**Multiple files for the same date**: Load the most recently modified one.

**File references paths that no longer exist**: Note during the briefing — "WARNING: `path/to/file.ts` referenced in session but not found on disk."

**File is from more than 7 days ago**: Note the gap — "WARNING: This session is from N days ago. Things may have changed." — then proceed normally.

**File is empty or malformed**: Report: "Handoff file found but appears empty or unreadable. You may need to create a new one with /save-session."

## Notes

- Never modify the handoff file when loading it — it's a read-only historical record
- The briefing format is fixed — do not skip sections even if they are empty
- "What Not To Retry" must always be shown, even if it just says "None" — it's too important to miss
- After resuming, the user may want to run `/save-session` again at the end of the new session to create a new dated file
