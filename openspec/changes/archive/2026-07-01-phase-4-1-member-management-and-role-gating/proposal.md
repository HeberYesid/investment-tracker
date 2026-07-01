## Why

Phase 4 (`openspec/changes/phase-4-auth-permissions`) shipped Supabase Auth, the
`portfolio_members` role model (`OWNER` / `EDITOR` / `VIEWER`), and RLS helpers
(`current_user_is_member`, `current_user_has_role`) — but every write policy
still hardcodes `'OWNER'`. The role model and the policies are out of sync:
the schema allows three roles, but the only role that can actually mutate
trades, imports, or alerts today is `OWNER`. `EDITOR` is defined and never
authorized; `VIEWER` is defined, never authorized, and never visible in the UI.

This change closes that gap. It is the smallest meaningful "sharing a
portfolio" experience we can ship while staying on Supabase Free / Vercel Hobby:

- Owners can invite existing users by email, change their role, and remove
  them — all from a new `/settings/members` page.
- Editors can create, update, and delete trades and CSV imports on portfolios
  they share. The RLS, the API, and the UI all stop blocking them.
- Viewers see the dashboard, trades, and import history, but the write
  affordances disappear. The "New operation" button, edit / delete actions, and
  the CSV import wizard all become invisible (or, where the page is empty
  without writes, the user is redirected back to the list with a friendly
  toast).

The plan from the prior session (re-derivable from
`docs/investment-tracker/phases/04-auth-permissions.md` lines 40 and 43) is
locked to four decisions:

1. Loosen the write policies on `trades`, `csv_imports`, `csv_import_rows`,
   `alerts`, and `audit_events` to `('OWNER','EDITOR')`. `portfolio_members`
   stays `OWNER`-only.
2. Invite mechanism: OWNER types an email of an **existing** user. Lookup via a
   new `public.find_user_by_email(text) returns uuid` `SECURITY DEFINER`
   function. We do **not** grant `select` on `auth.users` to `authenticated`.
3. UI lives at `src/app/settings/members/page.tsx`. The nav link
   `/settings` is updated to point to `/settings/members` (one href change, one
   matching test update).
4. OpenSpec is a brand-new change (`phase-4-1-member-management-and-role-gating`),
   not an extension of the still-open `phase-4-auth-permissions` change.

## What Changes

- New migration `supabase/migrations/0009_role_aware_trades_imports_rls.sql`
  that drops the `OWNER`-only write policies on `trades`, `csv_imports`,
  `csv_import_rows`, `alerts`, and `audit_events` and recreates them with
  `in ('OWNER','EDITOR')`. New SQL functions:
  `find_user_by_email(text) returns uuid`, `count_portfolio_owners(uuid)
  returns integer`, and `current_user_role(uuid) returns text`. All
  `SECURITY DEFINER` + `set search_path = public` and granted to
  `authenticated` where applicable.
- `src/lib/api/auth.ts` `requireApiUserWithPortfolio` learns an optional
  `{ writeAccess?: boolean }` argument. When `writeAccess: true` and the
  caller's role is `VIEWER`, the helper short-circuits with `forbidden()`.
- New Route Handlers under `src/app/api/v1/portfolio/members/`:
  `route.ts` (GET, POST) and `[id]/route.ts` (PATCH, DELETE). All four
  require OWNER. POST looks up the invitee via `find_user_by_email`; PATCH
  and DELETE use `count_portfolio_owners > 1` as a guard against demoting or
  removing the last OWNER.
- Existing write endpoints (`POST/PATCH/DELETE /api/v1/trades/...`,
  `POST /api/v1/imports/csv/preview`, `POST /api/v1/imports/csv/commit`) pass
  `{ writeAccess: true }` to `requireApiUserWithPortfolio`, so `VIEWER`
  gets a uniform `403 FORBIDDEN` envelope.
- New page `src/app/settings/members/page.tsx` (RSC) with redirect when the
  caller is not OWNER; renders
  `src/features/settings/members-management-client.tsx` (a `"use client"`
  component that lists members, adds by email, changes role, removes).
- New i18n file `src/lib/i18n/members.ts`; the existing nav dictionary's
  `Ajustes` link's `href` switches to `/settings/members`.
- Trades page (`src/app/trades/page.tsx`) and trade list client receive
  `canWrite={portfolio.role !== "VIEWER"}` and hide the "Nueva operación"
  button, edit, and delete controls accordingly. `/trades/new` and
  `/trades/[id]/edit` server-render a `redirect("/trades?denied=write")` for
  VIEWERs. The trades page reads `?denied=write` and shows an inline toast.
- The import page (`src/app/import/page.tsx`) passes a `readOnly` prop to
  `ImportPageClient`; for VIEWERs the wizard is replaced with a banner
  pointing at `ImportHistory`.

## Capabilities

### New Capabilities

- `portfolio-member-management`: OWNER can list members of the current
  portfolio, invite an existing user by email, change that user's role, and
  remove the user. The "last OWNER" guard prevents demoting or removing the
  sole OWNER. Lookup goes through `public.find_user_by_email` (a
  `SECURITY DEFINER` function) — the API never grants `select` on
  `auth.users` to `authenticated`.
- `role-aware-ui`: writes (trade create/edit/delete, CSV preview/commit, the
  "Nueva operación" button) are gated by role. OWNER and EDITOR can mutate;
  VIEWER cannot. Read paths (lists, dashboard, import history) remain
  available to all three roles.

### Modified Capabilities

- `portfolio-rls` (delta): trades, csv_imports, csv_import_rows, alerts, and
  audit_events write policies change from `current_user_has_role(id, 'OWNER')`
  to `current_user_has_role(id, 'OWNER') or current_user_has_role(id,
  'EDITOR')` (i.e. `role in ('OWNER','EDITOR')`).
- `auth-and-membership` (delta): `requireApiUserWithPortfolio` learns an
  optional `writeAccess` parameter; when true, `VIEWER` is rejected with 403
  at the API boundary (defense in depth — RLS already blocks it).

## Impact

- **DB**: new migration `0009`. No table changes. Drops and recreates ~12
  policies. Adds 3 functions and 1 view. Idempotent (uses `drop policy if
  exists` / `create or replace`).
- **API**: 2 new Route Handler files. 4 existing Route Handlers gain a single
  extra argument to `requireApiUserWithPortfolio`. No new env vars.
- **UI**: 1 new page (RSC) + 1 new client component + 1 new i18n file. 3
  existing pages and 2 client components gain a `canWrite` / `readOnly` prop.
  1 nav link href changes from `/settings` to `/settings/members`.
- **Tests**: 2 new SQL tests (extend `src/supabase/migrations/auth.test.ts`
  and `schema.test.ts`) covering the EDITOR write paths and the new
  functions; 2 new unit tests for the new members endpoints; 3 new unit
  tests for the role-aware UI branches.
- **No CI**: AGENTS.md notes there is no pipeline validating changes; the
  verification list is run manually before commit.
- **No cost change**: still USD 0/month.

## Out of scope

- Email-based invites with a pending `invites` table + Edge Function + SMTP.
- Multi-portfolio support or a portfolio switcher.
- Profile field editing (`full_name`, `locale`).
- Populating `audit_events.actor_user_id` (still `null`).
- E2E tests that actually sign in (existing env constraint — magic link needs
  real Supabase Auth env).
- Any new paid service. USD 0/month rule remains binding.
