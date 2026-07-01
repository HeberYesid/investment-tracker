## Context

Phase 4 added Supabase Auth, the `portfolio_members` role model
(`OWNER` / `EDITOR` / `VIEWER`), and two helper functions
(`current_user_is_member`, `current_user_has_role`) used by every RLS policy
in `supabase/migrations/0003_auth_and_permissions.sql`. The RLS policies
themselves, however, only ever check `'OWNER'`. The role model and the
policies are out of sync:

- The role column accepts `'EDITOR'` and `'VIEWER'` (the `isValidRole` check
  in `src/lib/csv/constants.ts` confirms this).
- The API for member management does not exist.
- The UI for member management does not exist.
- `EDITOR` and `VIEWER` are never authorized in any policy.

The prior session produced a locked plan (re-derivable from
`docs/investment-tracker/phases/04-auth-permissions.md` lines 40 and 43 plus
the four confirmed decisions). This design captures the *how* of that plan
without revisiting any of the *what* choices.

Key codebase facts this design relies on:

- `src/lib/api/auth.ts:32` `requireApiUserWithPortfolio` has **zero** call
  sites. The signature is free to be extended.
- `src/lib/api/errors.ts:46` `forbidden()` returns 403 with the project's
  standard `{ error: { code, message } }` envelope. Already imported by
  `src/app/api/v1/admin/sync/run/route.ts:30`.
- `src/lib/supabase/auth.ts:33` `getCurrentPortfolio()` already returns
  `{ portfolioId, role, portfolio }`. The role is typed as
  `PortfolioRole = 'OWNER' | 'EDITOR' | 'VIEWER'` via
  `src/lib/csv/constants.ts:12`.
- `src/lib/i18n/dictionary.ts:14` is the only place the nav links are
  defined; the matching test at `src/lib/i18n/dictionary.test.ts:12` is the
  only consumer.
- The PGlite test harness in `src/supabase/migrations/auth.test.ts` and
  `src/supabase/migrations/schema.test.ts` is the canonical way to test
  policies. `auth.test.ts` already stubs `auth.users` and sets
  `request.jwt.claim.sub`; multi-user RLS tests need 2-3 stubbed user rows
  + a helper to switch `auth.uid()`.
- `tests/AGENTS.md` forbids enabling `oxc: true` in `vitest.config.ts`.
  Vitest is currently configured with `oxc: false` and
  `esbuild: { jsx: "automatic" }`. **Do not flip that.**
- `src/supabase/migrations/schema.test.ts:22-37` enumerates every public
  table that must have RLS enabled. The list is used to fail the test when
  a new table is added without `enable row level security`. 0009 must keep
  that invariant.
- `check-db.mts` (repo root) contains a hardcoded service-role key and is
  tracked in git. Do not read or modify it; the user is expected to rotate
  the key out-of-band.

## Goals / Non-Goals

**Goals:**

- `OWNER` can manage members from the UI; `EDITOR` can mutate trades and
  imports; `VIEWER` can read but not mutate.
- The four endpoints under `/api/v1/portfolio/members/*` are OWNER-only and
  enforce the "last OWNER" guard.
- The UI never shows write controls to `VIEWER`. Where a page is meaningless
  without writes (`/trades/new`, `/trades/[id]/edit`), the user is redirected
  to `/trades?denied=write` with a toast.
- Zero new dependencies, zero new env vars, zero new services. USD 0/month.

**Non-Goals:**

- New table for pending invites (out of scope per the locked decision —
  invites only target existing users).
- Multi-portfolio or portfolio switcher.
- Profile editing (`full_name`, `locale`).
- Populating `audit_events.actor_user_id`.

## Decisions

### 1. Loosen writes to `('OWNER','EDITOR')` via a new migration 0009

We add a fresh `0009_role_aware_trades_imports_rls.sql` rather than editing
`0003`. The repo convention (`supabase/AGENTS.md`) is "migrations are
additive, never edited." 0009 drops the existing `owners can write ...`
policies on `trades`, `csv_imports`, `csv_import_rows`, `alerts`, and
`audit_events`, then recreates them with
`current_user_has_role(<portfolio_id>, 'OWNER') or
current_user_has_role(<portfolio_id>, 'EDITOR')`. `portfolio_members`
itself stays `OWNER`-only — sharing is a one-way door that only the owner
controls.

**Why not change `'OWNER'` everywhere to a single function call**: the
helper `current_user_has_role(p_id, p_role)` is already a one-liner; the
extra `or current_user_has_role(p_id, 'EDITOR')` is clear and grep-friendly.
A bespoke `current_user_can_write(p_id)` would obscure which roles are
allowed and make future `VIEWER`-writes (a deliberate product decision) a
mystery.

**Why `audit_events` and `alerts` also move to EDITOR**: for symmetry — the
app already inserts `audit_events` rows from the same `trades` POST that
`EDITOR` will now perform. If `EDITOR` is allowed to insert a trade, they
must also be allowed to insert the corresponding audit row (the audit row
scopes by `portfolio_id` and would otherwise be blocked by RLS, producing a
silent half-write). `alerts` is included so EDITORs can manage their own
thresholds without bothering the OWNER.

### 2. New functions, no new `auth.users` grants

We need three new SQL functions:

- `public.find_user_by_email(p_email text) returns uuid` — `SECURITY DEFINER`
  + `set search_path = public` + `STABLE`. Reads from `auth.users` to map
  email → id. `grant execute to authenticated`. We deliberately do **not**
  `grant select on auth.users to authenticated` — the function is the only
  surface area exposed to clients.
- `public.count_portfolio_owners(p_portfolio_id uuid) returns integer` —
  `SECURITY DEFINER` + `STABLE`. Used by PATCH/DELETE to guard against
  demoting or removing the last OWNER. The caller wraps the check in
  `select ... for update` on the existing OWNER rows of the portfolio to
  avoid a TOCTOU race.
- `public.current_user_role(p_portfolio_id uuid) returns text` — handy for
  the client when it needs the role inline (e.g. to render a badge). Same
  security shape as the existing helpers.

**Why SECURITY DEFINER + search_path**: same rationale as
`current_user_is_member` — the function runs as the function owner (which
has implicit access to `auth.users`) but with a pinned `search_path` so a
malicious caller can't override it via `SET search_path`. This is the
project's established pattern.

**Why no view that joins `auth.users`**: the only consumer of the email
column is the OWNER's own members page. Putting `auth.users.email` in a
view makes the data "discoverable" via the PostgREST API (and
`information_schema.columns`). A function call that takes a single email
keeps the data surface to a single row per call.

### 3. `requireApiUserWithPortfolio({ writeAccess: true })`

The helper learns a single new parameter, an options object with a
`writeAccess?: boolean` field. When `writeAccess: true` and the caller's
role is `VIEWER`, the helper returns `forbidden(errors.writeAccessDenied)`
(using the same `forbidden()` envelope already used by
`src/app/api/v1/admin/sync/run/route.ts:30`). Existing callers pass nothing
and see no behavior change.

**Why extend instead of adding a new helper**: the prior session
documented that `requireApiUserWithPortfolio` has zero call sites. Adding a
separate `requireApiUserWithWriteAccess` would create two near-identical
helpers that future readers have to compare. The optional second argument
is the minimal, surgical change.

**Why gate at the API and not just rely on RLS**: defense in depth. RLS
already blocks VIEWER writes; the API gate gives the client a uniform 403
response (so the UI can render a clean error) instead of a partial-success
PostgREST error. It also documents the intent at the route boundary.

### 4. "Last OWNER" guard

PATCH and DELETE both go through the same pattern:

1. `select user_id, role from portfolio_members where portfolio_id = $1
   and role = 'OWNER' for update` — locks the OWNER rows for the
   portfolio.
2. `select public.count_portfolio_owners($1)` — counts after the lock.
3. If the operation would leave fewer than one OWNER, return
   `409 Conflict` with the project's standard envelope.

The `for update` step is essential: a naïve `count → update` is not atomic
and a concurrent demotion could leave the portfolio with zero OWNERs. Even
though the current UI is single-tab, the lock makes the API safe for
future concurrent use.

**Why 409 (not 422 or 400)**: 409 is the conventional status for
"request can't be applied because of the current state of the resource."
422 implies a schema-level problem; 400 implies the request itself is
malformed.

### 5. Invite by email, not by ID

The UI's "Add member" form takes an email address. The server calls
`public.find_user_by_email(email)`. If the function returns `null` (no
match), the API returns `404 Not Found` with the project's envelope. The
client renders "No encontramos un usuario con ese correo — pídele que
inicie sesión primero."

**Why not send an invite email**: the locked decision explicitly keeps this
out of scope. The minimum viable sharing model is "ask your partner to
sign up, then add them by email." A real invite flow needs SMTP, an
`invites` table, and a confirmation route — all of which the user has
deferred.

### 6. New page at `/settings/members`

Server Component. Reads `getCurrentPortfolio()`. If `role !== 'OWNER'`,
calls `redirect("/")` (the dashboard). Otherwise server-fetches the
initial members list via the same RLS-bound query the GET endpoint uses
(no double fetch on first render), and passes it to a client component.

**Why redirect (not render-read-only)**: the only role that can use this
page is OWNER. If the user is not OWNER, there is nothing useful to show.

**Why fetch on the server**: the RLS-bound query is cheap and gives us
first-paint data without a loading skeleton. The client component still
re-fetches after mutations (the optimistic-update flow).

### 7. Role-aware UI branches

Two patterns, picked per page:

- `/trades` (list): thread `canWrite` through `TradesPageClient` →
  `TradeList` → `TradeRow`. When `canWrite: false`, the "Nueva operación"
  button, the edit button, and the delete button disappear. The list is
  still fully visible and interactive (filters, pagination).
- `/trades/new` and `/trades/[id]/edit`: these pages are meaningless
  without write access. The page itself calls
  `redirect("/trades?denied=write")` server-side for VIEWER. The trades
  list page reads `?denied=write` from `useSearchParams` and shows a
  3-second inline toast: "Tu rol es de solo lectura — no puedes crear ni
  editar operaciones."
- `/import`: replace the wizard with a banner + `<ImportHistory />` when
  `readOnly: true`. The history is still useful; the wizard is not.

**Why redirect for new/edit (vs. render-disabled)**: the form is the
whole page; there is no read-only version of it that makes sense. The user
asked for redirects, and the plan locked that decision.

**Why a toast, not a banner**: the toast is informational — the user
landed here because they tried to do something they can't. A persistent
banner would dominate the page on every navigation. A 3-second toast is
enough to confirm the action was blocked, and the URL (`?denied=write`) is
the long-lived state.

### 8. Nav href change

`src/lib/i18n/dictionary.ts:14` changes from `/settings` to
`/settings/members`. The matching test in
`src/lib/i18n/dictionary.test.ts:12` is updated. **Before** closing the
work, grep for any other reference to `/settings` (not `/settings/...`) in
`src/` to make sure nothing else 404s.

## Risks / Trade-offs

- **Race on "last OWNER"**: mitigated by `select ... for update` on the
  OWNER rows before counting. See decision 4.
- **PGlite multi-user RLS test**: the existing `auth.test.ts` stubs one
  `auth.users` row. Tests for EDITOR writes need 2-3 stub users. The
  existing pattern (insert + set `request.jwt.claim.sub`) extends
  naturally; if the test setup grows beyond a simple `beforeEach`, prefer
  a sibling file `src/supabase/migrations/auth-roles.test.ts` over
  mutating the existing one.
- **`portfolio_members` has no `updated_at`**: PATCH will not implement
  optimistic concurrency. The `updated_at`-less schema is documented in
  the existing tables; adding a column would change the PATCH semantics in
  subtle ways and is out of scope.
- **Existing references to `/settings`**: any link or test pointing to
  `/settings` will 404 after the nav change. Grep before closing.
- **Helper signature change**: `requireApiUserWithPortfolio` is currently
  called nowhere. Adding an optional second parameter is safe. Do not
  introduce a separate helper.
- **`/trades/new` and `/trades/[id]/edit` page gating**: redirect vs.
  render-disabled. The plan picks redirect because the page is empty
  without write access. If the user later wants a "your role is
  read-only" view, the new pages can be introduced as a follow-up.
- **Translated strings**: every new UI string goes through
  `src/lib/i18n/members.ts` and the existing `trades.ts` / `imports.ts`.
  No hardcoded Spanish in components.
- **Schema test brittleness**: `src/supabase/migrations/schema.test.ts`
  matches SQL by string. The new test for the new functions / view must
  not be over-specific (avoid matching exact line numbers); prefer
  `toMatch(/pattern/i)` and `toContain`.
- **Edge function / sync paths**: no Edge Function calls any of the new
  functions or policies directly. The PGlite + Vitest + Playwright
  coverage is sufficient.

## Migration Plan

1. Merge the PR with the migration + the API + UI changes.
2. Apply `0009_role_aware_trades_imports_rls.sql` to the Supabase project
   (manually via SQL editor or `supabase db push`).
3. No data backfill is needed — `EDITOR` / `VIEWER` rows can only exist
   after the members UI is live. Existing OWNER-only data is unchanged.
4. Deploy to Vercel. The new nav link works without any Supabase project
   config change.

Rollback: drop the new policies, drop the new functions, revert the code.
The 0003 baseline still enforces OWNER-only writes, which is the previous
state.

## Open Questions

- **Q: Do we need a CLI / seed script to promote an existing solo user to
  EDITOR of a fresh portfolio?** No — the only existing members are
  OWNERs (the trigger created them). No promotion is needed before
  shipping.
- **Q: Does the API need an `/api/v1/portfolio/members/{id}/leave`
  endpoint so a user can leave a portfolio?** Not in this change. The
  locked plan is OWNER removes others. The user can ask for "leave" in a
  follow-up.
- **Q: Should the new page gate by `role === 'OWNER'` or by
  `current_user_has_role('OWNER')`?** The former. RLS already blocks
  non-OWNER reads on `portfolio_members`; a separate, pre-RLS check
  keeps the route handler simple.
