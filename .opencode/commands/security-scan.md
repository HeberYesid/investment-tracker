---
description: Run a security review against the working tree, focused on OWASP Top 10, secrets, and unsafe dependencies
agent: general
subtask: true
---

# Security Scan

Run a focused security review of the current working tree. No external scanner required — this is a structured manual pass.

**Input**: $ARGUMENTS — optional target path (default `.`).

## Project Context

- Next.js 15 App Router + React 19 + Supabase
- `SUPABASE_SERVICE_ROLE_KEY` must NEVER be exposed to the client (no `NEXT_PUBLIC_*`, no client component imports)
- Budget constraint: USD 0/month — do not propose paid security vendors

## What to Look For

### CRITICAL — block commit

1. **Hardcoded secrets**: API keys, service-role keys, JWT secrets, DB URLs with credentials
   ```bash
   rg -n "service_role|SUPABASE_SERVICE_ROLE|api[_-]?key|secret" --type ts --type tsx --type json -g '!node_modules/*' -g '!.next/*' .
   ```
2. **SQL injection** in any `.ts` / `.tsx` file that builds raw SQL strings. The project should use parameterized queries / Supabase client methods.
3. **Command injection** in any `exec` / `spawn` / `eval`-equivalent calls with user input.
4. **Path traversal** in file-serving routes (`fs.readFile` with user-controlled paths).
5. **Auth/RLS gaps** on new Supabase tables: missing RLS policies, `using: true` placeholders, service-role client used in a Server Component.
6. **Open redirects** in route handlers or middleware.
7. **Unsafe deserialization** (`JSON.parse` of untrusted input without validation, `eval`-style code execution).

### HIGH — should fix

- Missing input validation in Route Handlers (`src/app/api/v1/**`)
- Missing CSRF protection on state-changing endpoints
- Cookies missing `httpOnly`, `secure`, `sameSite` flags
- Dependencies with known CVEs: `pnpm audit`
- Logging sensitive data (PII, tokens, passwords)

### MEDIUM — consider

- CORS misconfiguration (`*` in production)
- Missing rate limiting on auth or money endpoints
- Insufficient error responses (leaking stack traces)

## Workflow

1. Run the grep for hardcoded secrets first.
2. For each changed file (`git diff --name-only HEAD`), read it in full and check against the CRITICAL / HIGH list.
3. Run `pnpm audit` to surface vulnerable dependencies.
4. Compose a prioritized remediation list.

## Output

```
Security Scan
──────────────────────────────
Path scanned: <path>
Files reviewed: <count>

CRITICAL: <n>   (block)
HIGH:     <n>   (must fix)
MEDIUM:   <n>   (consider)

Findings
- [CRITICAL] path/to/file.ts:LINE — <issue> → <fix>
- [HIGH]     path/to/file.ts:LINE — <issue> → <fix>

Dependencies: <pnpm audit summary>

Recommendation: <PASS | FAIL>
```

## Edge Cases

- No `pnpm` lockfile → fall back to `package.json` and skip `pnpm audit`.
- Service-role key found → STOP, do not continue. Report only this finding.
