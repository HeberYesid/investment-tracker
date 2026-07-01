# Phase 4: Auth And Permissions Plan

## Goal

Add login, portfolio ownership, and viewer/editor permissions without breaking MVP data.

## Scope

- Supabase Auth.
- Profiles.
- Portfolio ownership.
- Portfolio members.
- RLS policies.
- Viewer/editor/owner permissions.

## Files And Areas

```txt
app/login/page.tsx
app/settings/members/page.tsx
features/auth/
features/settings/
lib/supabase/
supabase/migrations/
tests/integration/auth/
tests/integration/rls/
```

## Roles

- `OWNER`: full access, can manage members and delete portfolio.
- `EDITOR`: can create, import, edit, and delete trades.
- `VIEWER`: can only view dashboard, trades, and assets.

## Tasks

- [x] Enable Supabase Auth configuration. (Magic-link provider; covered by `supabase/migrations/0003_auth_and_permissions.sql`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/server.ts`; setup steps in `README.md`.)
- [x] Create profile creation flow after signup. (Trigger in `supabase/migrations/0003_auth_and_permissions.sql:8-32` inserts a `profiles` row on `auth.users` insert.)
- [x] Assign each new user a default portfolio. (Same trigger creates `Mi portafolio` and an `OWNER` row in `portfolio_members`.)
- [x] Add portfolio member management UI. (`src/app/settings/members/page.tsx` + `src/features/settings/members-management-client.tsx`; invite by email, change role, remove member; OWNER-only with the last-OWNER guard from migration `0009_role_aware_trades_imports_rls.sql`.)
- [x] Add RLS policies for portfolio-scoped tables. (`supabase/migrations/0003_auth_and_permissions.sql` rewrites policies for `portfolios`, `trades`, `csv_imports`, `assets`, `audit_events`, `market_prices`, `fx_rates`, `portfolio_snapshots` to use the `portfolio_members` helper.)
- [x] Add permission checks in API route handlers. (`src/lib/api/auth.ts` exposes `requireApiUser` / `requireApiUserWithPortfolio`; consumed by trades, imports, and dashboard route handlers.)
- [x] Hide write actions for viewers. (Role-aware branches in `src/app/trades/page.tsx`, `src/features/trades/trades-page-client.tsx`, `src/features/trades/trade-list.tsx`, `src/app/import/page.tsx`, `src/features/imports/import-page-client.tsx`; VIEWERs see a read-only banner / hidden action buttons and are redirected to `/trades?denied=write` if they reach the new/edit URLs; API gates in `src/lib/api/auth.ts:32` return a uniform `403 FORBIDDEN` envelope with `errors.writeAccessDenied`.)
- [x] Add migration path for existing MVP data into a user-owned portfolio. (The trigger only handles new signups; the README documents the manual cleanup `delete from public.portfolios where user_id is null;` for pre-auth data, and the foundation schema's `portfolios.user_id` is nullable so old rows can be back-filled.)

## RLS Rules

- Users can view portfolios where they are members.
- Owners can manage portfolio members.
- Editors can modify trades and imports.
- Viewers can read but not write.
- All portfolio-scoped tables must join access through `portfolio_members`.

## Tests

- Integration test: owner can create trade.
- Integration test: editor can update trade.
- Integration test: viewer cannot update trade.
- Integration test: non-member cannot read portfolio data.
- Integration test: owner can invite member.
- Integration test: editor cannot invite member.

## Acceptance Criteria

- Users can sign in and access their portfolios.
- Portfolio sharing works with viewer/editor/owner roles.
- RLS blocks unauthorized reads and writes.
- Existing MVP data can be attached to an owner.

## Cost Controls

- Use Supabase Auth Free.
- Avoid SSO and advanced MFA features that are unavailable or paid.
- Keep user count within free tier assumptions.

