---
description: Run a Python code review focused on PEP 8, type hints, security, and Pythonic idioms
agent: general
subtask: true
---

# Python Code Review

**Input**: $ARGUMENTS — optional path (default `.`).

> This project is primarily TypeScript (Next.js + pnpm). Use this command only for Python code that lives in `supabase/functions/` (Deno/TS, not Python), scripts, or imported Python services. If there are no `.py` files in the working tree, stop with: "No Python files to review."

## Step 1: Identify Python Changes

```bash
git diff --name-only HEAD -- '*.py'
```

If empty, stop: "No Python changes to review."

## Step 2: Run Static Analysis (only what is available)

```bash
ruff check . 2>/dev/null || true
mypy . 2>/dev/null || true
black --check . 2>/dev/null || true
bandit -r . 2>/dev/null || true
```

If none of these tools are installed, skip them and rely on the manual checklist below.

## Step 3: Review Categories

### CRITICAL — block

- SQL / command injection vulnerabilities
- Unsafe `eval` / `exec` usage
- `pickle.loads` of untrusted data
- Hardcoded credentials
- `yaml.load` instead of `yaml.safe_load`
- Bare `except:` hiding errors

### HIGH — should fix

- Missing type hints on public functions
- Mutable default arguments (`def f(x=[]): ...`)
- Swallowed exceptions silently
- Not using context managers (`with open(...)`)
- C-style looping instead of comprehensions
- `type(x) == Foo` instead of `isinstance(x, Foo)`
- Race conditions without locks

### MEDIUM — consider

- PEP 8 formatting violations
- Missing docstrings on public functions
- `print` instead of `logging`
- Inefficient string concatenation in loops
- Magic numbers without named constants
- String concatenation instead of f-strings (Python 3.6+)

## Step 4: Generate Report

```markdown
# Python Code Review Report

## Files Reviewed
- <path/to/file.py> (modified)
- <path/to/file.py> (added)

## Static Analysis
- ruff: <Pass / N issues / not installed>
- mypy: <Pass / N issues / not installed>
- black: <Pass / N issues / not installed>
- bandit: <Pass / N issues / not installed>

## Findings

### CRITICAL
- <path:line> — <issue> → <fix>

### HIGH
- <path:line> — <issue> → <fix>

### MEDIUM
- <path:line> — <issue> → <fix>

## Recommendation
- PASS / WARNING / FAIL
```

## Common Fix Patterns

- Mutable default arg → use `None` and assign inside
- `f = open(p); ...; f.close()` → `with open(p) as f: ...`
- C-style loop → list/dict comprehension
- String concat in loop → `"".join(...)`
